const BASIC = new Set(
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà',
)
const EXT = new Set('^{}\\[~]|€')
const replacements: Record<string, string> = {
  '\u2018': "'",
  '\u2019': "'",
  '\u201c': '"',
  '\u201d': '"',
  '\u2013': '-',
  '\u2014': '-',
  '\u2026': '...',
  '\u00a0': ' ',
  '\u202f': ' ',
}
export function normalizeSms(text: string) {
  // Protect the entire non-whitespace token, conservatively including punctuation.
  return text
    .split(/(\s+)/u)
    .map((token) =>
      /(?:https?:\/\/|www\.)/iu.test(token)
        ? token
        : token.replace(
            /[\u2018\u2019\u201c\u201d\u2013\u2014\u2026\u00a0\u202f]/gu,
            (c) => replacements[c],
          ),
    )
    .join('')
}
export function smsUnits(text: string) {
  const unsupported = [
    ...new Set([...text].filter((c) => !BASIC.has(c) && !EXT.has(c))),
  ]
  const unicode = unsupported.length > 0
  const units = unicode
    ? text.length
    : [...text].reduce((n, c) => n + (EXT.has(c) ? 2 : 1), 0)
  const segments =
    units <= (unicode ? 70 : 160) ? 1 : Math.ceil(units / (unicode ? 67 : 153))
  return {
    encoding: unicode ? 'Unicode' : 'GSM-7',
    units,
    segments,
    unsupported,
  }
}
export function textAdvice(text: string, recipients: number) {
  const info = smsUnits(text)
  const boundary =
    info.segments === 2
      ? info.encoding === 'Unicode'
        ? 70
        : 160
      : (info.segments - 1) * (info.encoding === 'Unicode' ? 67 : 153)
  const withoutUnsupported = text
    .split(/(\s+)/u)
    .map((token) =>
      /(?:https?:\/\/|www\.)/iu.test(token)
        ? token
        : [...token].filter((c) => BASIC.has(c) || EXT.has(c)).join(''),
    )
    .join('')
  const unicodeSavings =
    Math.max(0, info.segments - smsUnits(withoutUnsupported).segments) *
    recipients
  return {
    ...info,
    unicodeSavings,
    totalSegments: info.segments * recipients,
    trimUnits: info.segments > 1 ? info.units - boundary : 0,
    saveOneSegmentTotal: info.segments > 1 ? recipients : 0,
  }
}
