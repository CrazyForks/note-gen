"use client";
import {
  BoldItalicUnderlineToggles,
  ChangeCodeMirrorLanguage,
  CodeMirrorEditor,
  ConditionalContents,
  DiffSourceToggleWrapper,
  InsertCodeBlock,
  InsertSandpack,
  MDXEditor,
  MDXEditorMethods,
  SandpackConfig,
  ShowSandpackInfo,
  UndoRedo,
  codeBlockPlugin,
  codeMirrorPlugin,
  diffSourcePlugin,
  frontmatterPlugin,
  headingsPlugin,
  imagePlugin,
  linkPlugin,
  listsPlugin,
  markdownShortcutPlugin,
  quotePlugin,
  sandpackPlugin,
  tablePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
} from "@mdxeditor/editor";
import { FC } from "react";

interface EditorProps {
  markdown: string;
  ref?: React.MutableRefObject<MDXEditorMethods | null>;
}

const MdEditor: FC<EditorProps> = ({ markdown, ref }) => {
  return (
    <MDXEditor
      // onChange={(e) => console.log(e)}
      ref={ref}
      contentEditableClassName="prose"
      markdown={markdown}
      plugins={[
        headingsPlugin(),
        quotePlugin(),
        listsPlugin(),
        linkPlugin(),
        tablePlugin(),
        markdownShortcutPlugin(),
        frontmatterPlugin(),
        diffSourcePlugin({ diffMarkdown: 'An older version', viewMode: 'rich-text' }),
        imagePlugin(),
        thematicBreakPlugin(),
        codeBlockPlugin({ 
          defaultCodeBlockLanguage: 'txt', 
          codeBlockEditorDescriptors: [{
            priority: 100,
            match: () => true,
            Editor: CodeMirrorEditor,
          }]
        }),
        codeMirrorPlugin({
          codeBlockLanguages: {
            '': '',
            js: "JavaScript",
            css: "CSS",
            txt: "text",
            ts: "TypeScript",
            html: "HTML",
            json: "JSON",
          },
        }),
        toolbarPlugin({
          toolbarContents: () => (
            <>
              {' '}
              <UndoRedo />
              <BoldItalicUnderlineToggles />
              <DiffSourceToggleWrapper children={undefined} />
              <ConditionalContents
                options={[
                  { when: (editor) => editor?.editorType === 'codeblock', contents: () => <ChangeCodeMirrorLanguage /> },
                  { when: (editor) => editor?.editorType === 'sandpack', contents: () => <ShowSandpackInfo /> },
                  { fallback: () => ( <> 
                  <InsertCodeBlock />
                </>) }
                ]}
              />
            </>
          )
        })
      ]}
    />
  );
};

export default MdEditor;