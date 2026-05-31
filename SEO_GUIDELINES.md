# SEO & Domain Authority — Agent Instructions

Instructions for an AI agent operating inside a codebase. Goal: optimize pages so the underlying signals that drive organic visibility and third‑party authority metrics (Moz DA, Ahrefs DR, Semrush AS) are maximized.

---

## 0. Read this first (mental model)

- **Domain Authority is not a Google ranking factor.** It is a third‑party *prediction* of ranking strength. Do **not** chase the number directly. Optimize the real signals below and the metric follows.
- The metric scale is **logarithmic**: moving 0→20 is easy, 70→71 is extremely hard. Compounding quality, not volume, is the lever.
- In the 2025–2026 algorithm environment the dominant signals are: **reputational weight, verifiable human expertise (E‑E‑A‑T), Information Gain (novelty), technical performance (Core Web Vitals/INP), and brand search demand.** Brute‑force backlinks are deprioritized (~13% of ranking weight) but still drive the third‑party metrics.
- Mass‑produced or purely paraphrased content is actively suppressed. AI‑assisted content is fine **only if** the final output adds novel information, original data, or a proprietary framework.

**Agent rule of thumb:** every page you touch must be (1) technically flawless, (2) attributed to a real expert, (3) carry information not found elsewhere, and (4) be wired into the site's topic graph.

---

## 1. Per‑page checklist (run on EVERY page you create or edit)

Treat this as a gate. Do not consider a page "done" until all apply.

- [ ] One `<h1>`; logical `h2 → h3` hierarchy, no skipped levels
- [ ] Unique `<title>` (≤ 60 chars) and `<meta name="description">` (≤ 155 chars)
- [ ] Canonical tag present and self‑referencing (or pointing to the correct canonical)
- [ ] Author is a **real, named person** with a linked bio — never "Admin" or a brand name
- [ ] Appropriate JSON‑LD schema injected (see §3) and validates
- [ ] Open Graph + Twitter card meta present
- [ ] Page is reachable via at least one internal link (no orphans — see §6)
- [ ] Desktop and mobile render identical content, meta, headings, and schema (§2)
- [ ] At least one Information Gain element present (§4.2)
- [ ] `lastmod` / "updated" date is accurate and surfaced in markup
- [ ] Images: explicit `width`/`height` (prevent CLS), descriptive `alt`, lazy‑load below the fold, modern format (AVIF/WebP)
- [ ] No `noindex` accidentally applied; not blocked in `robots.txt`

---

## 2. Technical foundation

### 2.1 Core Web Vitals (hard targets)

Optimize every template to hit the **"Good"** column. CWV is a ranking tiebreaker (~10–15% weight) and directly correlates with AI citation rate.

| Metric | Measures | Good | Needs work | Poor |
|---|---|---|---|---|
| **LCP** | Visual load speed | ≤ 2.5 s | 2.5–4.0 s | > 4.0 s |
| **INP** | Total interaction latency | ≤ 200 ms | 200–500 ms | > 500 ms |
| **CLS** | Layout stability | ≤ 0.1 | 0.1–0.25 | > 0.25 |

Implementation tasks:
- **LCP**: preload the LCP image/font, serve responsive images, use a CDN, eliminate render‑blocking CSS/JS, set `fetchpriority="high"` on the hero image.
- **INP** (replaced FID in 2024 — measures *all* interactions, not just the first): break up long tasks, defer/code‑split non‑critical JS, debounce handlers, avoid heavy synchronous work on the main thread, use `requestIdleCallback`.
- **CLS**: reserve space for images/ads/embeds with explicit dimensions or `aspect-ratio`; never inject content above existing content; preload fonts and use `font-display: optional/swap` carefully.
- A 3 s+ LCP correlates with heavy traffic loss and ~53% mobile abandonment. FCP < 0.4 s correlates with ~3× more AI citations than pages slower than ~1.1 s.

### 2.2 Rendering
- Use **Server‑Side Rendering (SSR)** or static generation for all SEO‑critical content. Client‑side‑only rendering can delay indexing by days/weeks.
- Ensure critical content and links exist in the initial HTML response, not only after hydration.

### 2.3 Mobile‑first parity (Google indexes the mobile version, period)
- Mobile and desktop must have **identical**: textual content, headings, meta tags, structured data, and internal links.
- Do not block CSS/JS/image resources for mobile in `robots.txt`.
- Never serve `noindex` on mobile layouts.

### 2.4 Crawl plumbing
- Maintain a valid, auto‑updating `sitemap.xml` (include `lastmod`); reference it in `robots.txt`.
- Keep `robots.txt` minimal and intentional; verify nothing important is disallowed.
- Return correct status codes: 200 for live, 301 for moved, 410 for permanently gone, proper 404s.

---

## 3. Structured data (JSON‑LD) — required on relevant templates

Inject JSON‑LD in `<head>` or end of `<body>`. Validate against Schema.org and Google's Rich Results Test. Schema is how the entity graph is communicated to AI/search systems.

### 3.1 Article + Author (content pages)
```json
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "PAGE_TITLE",
  "datePublished": "ISO_DATE",
  "dateModified": "ISO_DATE",
  "author": {
    "@type": "Person",
    "name": "Jane Doe",
    "jobTitle": "Senior X",
    "url": "https://site.com/authors/jane-doe",
    "sameAs": [
      "https://www.linkedin.com/in/janedoe",
      "https://twitter.com/janedoe"
    ]
  },
  "publisher": { "@id": "https://site.com/#organization" }
}
```
`sameAs` links the author entity to external profiles → builds the Trust Graph. Always include for YMYL topics.

### 3.2 Organization (site‑wide, in root layout)
```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": "https://site.com/#organization",
  "name": "Acme Corp",
  "url": "https://site.com",
  "logo": "https://site.com/logo.png",
  "sameAs": ["https://www.linkedin.com/company/acme", "..."]
}
```

### 3.3 Review / AggregateRating (products, services)
Generates star rich snippets → CTR uplift of ~20–30%. Only emit from genuine on‑page reviews.
```json
{
  "@type": "Product",
  "name": "PRODUCT",
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.7",
    "reviewCount": "182"
  }
}
```

### 3.4 FAQ / HowTo
Add `FAQPage` or `HowTo` schema where the content genuinely contains Q&A or step sequences. Helps capture zero‑click / AI‑overview slots. Do not fabricate Q&A to game it.

### 3.5 LocalBusiness / Product
For location‑based businesses add `LocalBusiness` with exact NAP (Name, Address, Phone) — must match the on‑page NAP and Google Business Profile exactly (§8).

---

## 4. Content structure for SEO + Answer Engine Optimization (AEO)

By 2026 most searches are zero‑click and AI Overviews appear on a large share of queries. Format content so it can be **cited by LLMs** and extracted into AI answers.

### 4.1 Chunk extraction (formatting rules)
- **Paragraph velocity:** key answers in tight **40–60 word** paragraphs that stand alone without surrounding context.
- **Heading hierarchy:** `H2 → H3 → bulleted list` cascades increase AI citation likelihood (~+40%). Lead a section with the direct answer, then expand.
- **Listicles / comparison tables** are disproportionately cited — use them for comparative or "best X" content. Comparison tables beat narrative prose for extraction.
- Put the direct answer in the **first sentence** under each heading (inverted pyramid).

### 4.2 Information Gain rubric (the novelty gate)
Every substantive page must include **at least one**, ideally several:
1. **Proprietary data** — original survey results, internal metrics, exclusive datasets.
2. **First‑hand evidence** — original photography, raw test data, field notes, screenshots of real dashboards.
3. **Original framework** — a uniquely named methodology, not recycled generic advice.
4. **Expert attribution** — a credentialed named author whose external footprint corroborates expertise.
5. **Freshness hook** — tie to recent events / continuously updated stats.

If a page only paraphrases what already ranks, **flag it** rather than publish — pure aggregation is suppressed (60–80% visibility loss for AI‑farm content).

### 4.3 Topic clusters (site architecture)
- Build **pillar pages** (broad, authoritative hubs, ~1,500–3,000 words) supported by **cluster pages** (hyper‑specific subtopics).
- Every cluster page links up to its pillar; the pillar links down to every cluster. (Wiring rules in §6.)
- Aim for ~100% coverage of a niche before expanding to a new topic. Depth beats breadth.
- **Word count is not a ranking factor.** Length should follow semantic completeness. When a page uses ≥ ~50% of the semantically relevant terms for the topic, length stops mattering — favor concise, dense pages over padding.

### 4.4 Freshness (QDF)
- Surface accurate `dateModified` in markup and UI.
- Prioritize **updating existing high‑value pages** over net‑new content (2.7–4.1× ROI; refreshed pages re‑rank ~76% faster). Build a recurring task to re‑audit and refresh top pages within a rolling 30‑day window where the topic warrants freshness.

---

## 5. E‑E‑A‑T implementation (in code)

Experience, Expertise, Authoritativeness, Trustworthiness — the quality lens human raters use to train the ranking models. Build these as reusable components:

- **Author entity system:** an `/authors/{slug}` page per writer with real credentials, bio, photo, and `sameAs` links (LinkedIn, professional directories). Wire bylines on every article to these entities. Eliminate any "Admin"/brand‑name authorship.
- **Trust pages (site‑wide, required especially for YMYL — finance/health/legal):** transparent Contact, editorial guidelines, Terms of Service, Privacy, and detailed corporate/About info. For YMYL, surface explicit professional qualifications.
- **Experience injection components:** reusable blocks for "From the Field" notes, original screenshots, raw case‑study data, and authenticated face‑and‑name testimonials. About page = "trophy room" (awards, certifications).
- **UGC surfaces:** review sections / Q&A on key service pages, moderated comment threads. Engagement correlates strongly with surviving core updates (top pages showed ~4× more ratings, ~3× more comments than decliners). Ensure UGC is crawlable and schema‑tagged where it's review content.

---

## 6. Internal linking (PageRank distribution)

- **No orphan pages.** Every page must have ≥ 1 inbound internal link from a relevant page. Add a CI/lint check that fails the build on orphans.
- Use **descriptive anchor text** (not "click here") that signals the target topic.
- Place links **within main content**, near relevant context — not just in footers/sidebars.
- Funnel link equity toward **pillar pages and priority conversion pages**.
- LLMs read internal link structure as context — clean architecture improves AI summarization/citation.
- Maintain breadcrumb navigation (with `BreadcrumbList` schema) to reinforce hierarchy.

---

## 7. Backlink / anchor‑text safety (for off‑site links you control or generate)

When the codebase generates link assets, sitemaps for PR landing pages, or anchor text, keep the *acquired* profile within natural distributions to avoid SpamBrain suppression.

| Anchor category | Target % | Example |
|---|---|---|
| Branded | 20–40% | "according to Acme Corp" |
| Naked URL | 15–25% | `https://www.acmecorp.com` |
| Generic | 10–20% | "read the full report" |
| Exact‑match commercial | < 5–20% (keep low) | "best accounting software" |

- Never mass‑deploy exact‑match commercial anchors — concentrated unnatural patterns trigger penalties.
- **Disavow tool is a last‑resort "nuclear" option.** Only relevant under: a verified manual action, a confirmed negative‑SEO attack, or documented failed manual removal. Never disavow merely because a referrer has low DA. (This is a strategic decision — flag to a human, don't automate.)

---

## 8. Local SEO (only if the site serves geographic regions)

- **NAP consistency:** identical Name/Address/Phone across every page, `LocalBusiness` schema, and the Google Business Profile. Inconsistency stalls local authority.
- Implement `LocalBusiness` schema with geo‑coordinates and hours.
- Build location landing pages with genuine local content; wire them into the internal link graph.
- GBP category selection and review sentiment are the dominant local factors (handled outside the codebase, but surface review content on‑site where possible).

---

## 9. Validation — how to verify your work

Before marking a task complete, run/confirm:

1. **Schema:** Google Rich Results Test + Schema.org validator — zero errors.
2. **CWV:** Lighthouse (mobile profile) and/or PageSpeed Insights — LCP/INP/CLS in "Good." Prefer field data (CrUX) where available.
3. **Rendering:** view the raw HTML response (curl / "view source", not devtools DOM) — confirm content, links, and schema are present pre‑hydration.
4. **Mobile parity:** diff desktop vs mobile rendered content, meta, and schema.
5. **Indexability:** confirm no stray `noindex`, correct canonical, page in sitemap, not disallowed in `robots.txt`.
6. **Internal links:** crawl (e.g. via a link checker) — no orphans, no broken internal links, descriptive anchors.
7. **Information Gain:** confirm at least one §4.2 element is genuinely present.
8. **Links/headings:** single H1, clean hierarchy, alt text on images, dimensions set.

---

## 10. Priority order (when optimizing an existing codebase)

1. Fix indexability / rendering blockers (anything stopping crawl or index).
2. Hit Core Web Vitals targets on key templates.
3. Add/repair structured data (Organization, Article+Author, Review).
4. Establish the author‑entity system and trust pages (E‑E‑A‑T).
5. Wire internal linking + eliminate orphans; build topic‑cluster structure.
6. Refresh and add Information Gain to top existing pages (highest ROI).
7. Reformat content for AEO chunk extraction.
8. Local SEO if applicable.

> Source basis: 2026 search‑ecosystem research. Treat thresholds (CWV, anchor %, schema requirements) as authoritative; treat the DA score as a lagging indicator, not a target.
