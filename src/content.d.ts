// Site content from content/, provided by plugins/content.
declare module 'virtual:content' {
  const content: import('../plugins/content/types.ts').Content
  export default content
}
