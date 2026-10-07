// Vite turns an image import into a resolved URL string.
declare module '*.png' {
  const url: string
  export default url
}
