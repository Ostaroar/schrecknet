// Per-route <title>/<meta description>/OG tags (docs/seo-geo-aeo-plan.md § 4.1,
// S1). Hand-rolled — no head-management dependency needed for one title + a
// couple of meta tags. Helps JS-executing crawlers (Googlebot) and chat-app
// link-preview bots; does NOT help GEO/AEO crawlers, which don't run this code
// at all — that needs the prerendering work in S3.
import { useEffect } from 'react'

export interface DocumentHead {
  title: string
  description: string
}

function upsertMeta(attr: 'name' | 'property', key: string, content: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

/** Pass null for routes that don't own document head (e.g. a page that will
 * set a more specific head itself once its async data loads) — this no-ops
 * rather than overwriting a value a child component's effect already set. */
export function useDocumentHead(head: DocumentHead | null): void {
  useEffect(() => {
    if (!head) return
    document.title = head.title
    upsertMeta('name', 'description', head.description)
    upsertMeta('property', 'og:title', head.title)
    upsertMeta('property', 'og:description', head.description)
    upsertMeta('name', 'twitter:card', 'summary')
    upsertMeta('name', 'twitter:title', head.title)
    upsertMeta('name', 'twitter:description', head.description)
  }, [head?.title, head?.description])
}
