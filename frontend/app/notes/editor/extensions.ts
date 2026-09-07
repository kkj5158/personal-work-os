import {
  Node,
  Extension,
  InputRule,
  mergeAttributes,
  nodePasteRule,
} from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { validRow } from "@/lib/notes/model";
import { MediaRowView } from "./MediaRow";

export const WikiLink = Node.create({
  name: "wikiLink",
  group: "inline",
  inline: true,
  atom: true,
  addAttributes: () => ({ title: { default: "" } }),
  parseHTML: () => [
    {
      tag: "span[data-wiki-title]",
      getAttrs: (el) => ({ title: el.getAttribute("data-wiki-title") }),
    },
  ],
  renderHTML: ({ node, HTMLAttributes }) => [
    "span",
    mergeAttributes(HTMLAttributes, {
      "data-wiki-title": node.attrs.title,
      class: "wiki-link",
      role: "link",
      tabindex: "0",
    }),
    node.attrs.title,
  ],
  renderText: ({ node }) => `[[${node.attrs.title}]]`,
  markdownTokenName: "wikiLink",
  markdownTokenizer: {
    name: "wikiLink",
    level: "inline",
    start: (src) => src.indexOf("[["),
    tokenize: (src) => {
      const match = /^\[\[([^\[\]\n]{1,240})\]\]/.exec(src);
      if (match)
        return { type: "wikiLink", raw: match[0], title: match[1].trim() };
    },
  },
  parseMarkdown: (token, helpers) =>
    helpers.createNode("wikiLink", { title: token.title }),
  renderMarkdown: (node) => `[[${node.attrs?.title}]]`,
  addInputRules() {
    return [
      new InputRule({
        find: /\[\[([^\[\]\n]{1,240})\]\]$/,
        handler: ({ state, range, match }) => {
          state.tr.replaceWith(
            range.from,
            range.to,
            this.type.create({ title: match[1].trim() }),
          );
        },
      }),
    ];
  },
  addPasteRules() {
    return [
      nodePasteRule({
        find: /\[\[([^\[\]\n]{1,240})\]\]/g,
        type: this.type,
        getAttributes: (match) => ({ title: match[1].trim() }),
      }),
    ];
  },
});
export const MediaRow = Node.create({
  name: "mediaRow",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes: () => ({
    images: { default: [] },
    width: { default: 100 },
    align: { default: "left" },
  }),
  parseHTML: () => [],
  renderHTML: ({ HTMLAttributes }) => [
    "div",
    mergeAttributes(HTMLAttributes, { "data-media-row": "true" }),
  ],
  addNodeView: () => ReactNodeViewRenderer(MediaRowView),
  markdownTokenName: "mediaRow",
  markdownTokenizer: {
    name: "mediaRow",
    level: "block",
    start: (src) => src.indexOf(":::images "),
    tokenize: (src) => {
      const match = /^:::images ([^\n]+)\n:::(?:\n|$)/.exec(src);
      if (!match) return;
      try {
        const row: unknown = JSON.parse(match[1]);
        if (validRow(row)) return { type: "mediaRow", raw: match[0], row };
      } catch {}
    },
  },
  parseMarkdown: (token, helpers) =>
    helpers.createNode("mediaRow", token.row as Record<string, unknown>),
  renderMarkdown: (node) => `:::images ${JSON.stringify(node.attrs)}\n:::`,
});
export const findKey = new PluginKey<{
  query: string;
  current: number;
  matches: { from: number; to: number }[];
}>("noteFind");
export const NoteFind = Extension.create({
  name: "noteFind",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: findKey,
        state: {
          init: () => ({ query: "", current: 0, matches: [] }),
          apply(tr, previous) {
            const state = { ...previous, ...tr.getMeta(findKey) };
            state.matches = [];
            if (state.query)
              tr.doc.descendants((node, pos) => {
                if (!node.isText) return;
                const text = node.text!.toLocaleLowerCase();
                const q = state.query.toLocaleLowerCase();
                let at = 0;
                while ((at = text.indexOf(q, at)) >= 0) {
                  state.matches.push({
                    from: pos + at,
                    to: pos + at + q.length,
                  });
                  at += q.length;
                }
              });
            state.current = state.matches.length
              ? (state.current + state.matches.length) % state.matches.length
              : 0;
            return state;
          },
        },
        props: {
          decorations(state) {
            const found = findKey.getState(state)!;
            return DecorationSet.create(
              state.doc,
              found.matches.map((m, i) =>
                Decoration.inline(m.from, m.to, {
                  class: i === found.current ? "find-current" : "find-match",
                }),
              ),
            );
          },
        },
      }),
    ];
  },
});
