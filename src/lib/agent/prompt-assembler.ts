import { getSelectedServerTools } from '@/lib/mcp/tools'
import type { AgentContextSnapshot, AgentTool } from './types'

function formatToolCatalog(tools: AgentTool[]) {
  return tools
    .map((tool) => `- ${tool.name}: ${tool.title}. ${tool.description}`)
    .join('\n')
}

function formatSkills(context: AgentContextSnapshot) {
  const skills = context.availableSkills ?? []
  if (skills.length === 0) {
    return ''
  }

  return [
    '## Skills',
    'Skills are guidance documents, not direct actions. Use skill_load when a skill is relevant, then use concrete tools to act.',
    ...skills.map((skill) => `- ${skill.id}: ${skill.name}${skill.description ? ` - ${skill.description}` : ''}`),
  ].join('\n')
}

function formatMcpCatalog() {
  try {
    const selectedTools = getSelectedServerTools()
    if (selectedTools.length === 0) {
      return ''
    }

    return [
      '## MCP Tools',
      'Use mcp_call_tool with serverId, toolName, and args when an external MCP capability is needed.',
      ...selectedTools.map(({ serverId, serverName, tool }) =>
        `- ${serverId}/${tool.name} (${serverName}): ${tool.description || tool.name}`
      ),
    ].join('\n')
  } catch {
    return ''
  }
}

function formatActiveFile(context: AgentContextSnapshot) {
  if (!context.activeFilePath) {
    return ''
  }

  return [
    '## Current Open File',
    `The current editor file is "${context.activeFilePath}".`,
    'Use editor tools only for this current open file. If the user explicitly names a different Markdown file path, use note_read_file and note_update_file for that target file instead of editor tools.',
  ].join('\n')
}

function formatQuote(context: AgentContextSnapshot) {
  const quote = context.currentQuote
  if (!quote) {
    return ''
  }

  const lineText = quote.startLine === quote.endLine
    ? `line ${quote.startLine}`
    : `lines ${quote.startLine}-${quote.endLine}`

  return [
    '## Current Editor Selection',
    `The user selected content in "${quote.fileName}" at ${lineText}.`,
    quote.from >= 0 && quote.to >= quote.from
      ? `Selection range: from=${quote.from}, to=${quote.to}. For explicit edits to the selection, use editor_replace_range or editor_apply_transaction and keep the edit inside this range unless the user explicitly asks for a larger scope.`
      : 'Exact selection offsets are unavailable. Use editor_replace_lines for explicit edits when line numbers are valid.',
    'When editing a selection, the replacement content must be ONLY the rewritten selected text. Do not include surrounding headings, list items, unchanged paragraphs, separators, or any content outside the selected range.',
    'If the selection is a single body line, the replacement content must also be one body line. Never include Markdown headings such as "## 目标", blank lines, or adjacent paragraphs.',
    'When the user asks to rewrite, formalize, polish, optimize, or improve selected text, the replacement must be meaningfully different from the selected text. Never call an editor write tool with unchanged content.',
    quote.fullContent
      ? `Selected content:\n---\n${quote.fullContent}\n---`
      : '',
  ].filter(Boolean).join('\n')
}

export class AgentPromptAssembler {
  assemble(context: AgentContextSnapshot, tools: AgentTool[]) {
    const sections = [
      'You are NoteGen Agent, an efficient note-taking assistant embedded in a Markdown editor.',
      'Use structured tool calls when action is needed. Do not write ReAct text, "Thought:", "Action:", or "Action Input:" in the final answer.',
      'Answer directly when the user is asking a question. Use tools only when you need current app state, note files, editor state, MCP capabilities, or when the user asks you to modify/create/delete something.',
      '',
      '## Core Rules',
      '- Prefer editor tools for the currently open note. Do not overwrite an open editor file through file tools.',
      '- When the user names a specific Markdown file path, first compare it with the current open file. If it is a different file, do not call editor_get_state or any editor write tool; use note file tools for that named file.',
      '- If the user asks to open or switch to a Markdown file, use note_open_file. Do not answer that opening files is unsupported.',
      '- If the user asks to create/new a file, use note_create_file only. If the file already exists, report that it already exists; never switch to update or editor tools unless the user explicitly asks to overwrite/update it.',
      '- If the user asks to create a Skill, first skill_load the relevant creator skill when available, then create the concrete Skill files. A Skill directory alone is not complete; it must include a SKILL.md with frontmatter and usable instructions.',
      '- For long runtime scripts, do not pass multiline code through "node -e" or "python -c"; create a script file under skills/{skill_id}/runtime/ and then call skill_execute_script with that filename.',
      '- If the user asks to list or inspect MCP services/tools, use mcp_list_tools.',
      '- If the user explicitly asks to use MCP for a task, use mcp_list_tools and/or mcp_call_tool. Do not replace that request with note or editor tools.',
      '- If the current note content is already provided in App Context, summarize or analyze that content directly. Do not call editor write tools to place the answer into the note.',
      '- If the user says not to modify, edit, write, save, create, or delete, do not call any write tool and do not ask for write approval.',
      '- For quoted/selected content, explain or summarize directly unless the user explicitly asks to edit it.',
      '- When the user explicitly asks to edit quoted/selected content, use the editor range/line tool and replace only the selected content itself.',
      '- For edits, preserve user content and scope. Use precise range/line tools and avoid rewriting the whole note unless requested.',
      '- Use editor_insert_at_cursor only when the user explicitly says to insert at the cursor/current position. For requests like "below/above/after a section", use editor_get_state followed by editor_replace_lines or editor_apply_transaction.',
      '- After each tool result, decide whether the requested task is fully complete. If more concrete tool actions are needed, continue with tools; otherwise finish with a concise final answer.',
      '- If a tool result says the user denied or cancelled an operation, stop or propose a read-only alternative.',
      '',
      '## Available Tools',
      formatToolCatalog(tools),
      formatActiveFile(context),
      formatQuote(context),
      formatSkills(context),
      formatMcpCatalog(),
    ].filter((section) => section.trim().length > 0)

    return sections.join('\n\n')
  }
}
