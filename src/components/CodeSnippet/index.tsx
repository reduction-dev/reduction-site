import React from 'react';
import CodeBlock from '@theme/CodeBlock';
import { extractSnippet } from './extract-snippet';

export interface CodeSnippetProps {
  /** code string to pass to CodeBlock children */
  code: string;        
  /** language string for CodeBlock */
  language: "go" | "typescript"
  /** marker to extract snippet. If not provided, uses full code with snippet markers removed */
  marker?: string;      
  title?: string;
}

const CodeSnippet: React.FC<CodeSnippetProps> = ({ code, language, marker, title }) => {
  const snippet = extractSnippet(code, marker);
  return (
    <CodeBlock language={language} title={title}>
      {snippet}
    </CodeBlock>
  );
};

export default CodeSnippet;
