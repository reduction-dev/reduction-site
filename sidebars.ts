import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const sidebars: SidebarsConfig = {
  docsSidebar: [
    { type: "autogenerated", dirName: "." },
    {
      type: "category",
      label: "Reference",
      items: [
        {
          type: "link",
          label: "Go SDK",
          href: "https://pkg.go.dev/reduction.dev/reduction-go@master",
        },
        {
          type: "link",
          label: "TypeScript SDK",
          href: "https://reduction-dev.github.io/reduction-ts/",
        },
      ],
    },
  ],
};

export default sidebars;
