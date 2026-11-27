export function csv(rows: Array<Array<string | number | undefined | null>>) {
  return '\uFEFF' + rows.map((row) => row.map((cell) => {
    let value = String(cell ?? '')
    if (typeof cell === 'string' && /^[\s\uFEFF]*[=+\-@]/.test(value)) value = "'" + value
    return '"' + value.replaceAll('"', '""') + '"'
  }).join(',')).join('\r\n')
}

export async function exportFile(name: string, content: string, type: string) {
  const file = new File([content], name, { type })
  if (navigator.canShare?.({ files: [file] }) && typeof navigator.share === 'function') {
    try {
      await navigator.share({ files: [file] })
      return
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
    }
  }
  const href = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = href
  link.download = name
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(href), 30000)
}
