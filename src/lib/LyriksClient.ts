import { EventEmitter } from "events"
import fetch from "node-fetch"
import * as NodeCache from "node-cache"
import * as cheerio from "cheerio"
import Lyriks from "./Lyriks"
import LyriksProvidersConfig from "./LyriksProvidersConfig"
import { CacheLyriks, LyriksClientOptions, LyriksProviders, ProviderConfig } from "./types"

interface SearchHit {
    url: string,
    title: string,
    author: string
}

class LyriksClient extends EventEmitter {
    options: LyriksClientOptions
    cache: NodeCache
    #token: string | null = null

    constructor (options: LyriksClientOptions = {}) {
        super()
        this.options = Object.assign({
            userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:63.0) Gecko/20100101 Firefox/63.0",
            timeout: 5000,
            default: LyriksProviders.AZ_LYRICS,
            throwErrors: false,
            cache: {
                checkPeriod: 0,
                TTL: 0
            }
        }, options)

        this.cache = new NodeCache({ stdTTL: this.options.cache?.TTL, checkperiod: this.options.cache?.checkPeriod })
    }

    async getLyrics (search: string, source: LyriksProviders = this.options.default!!): Promise<Lyriks | null> {
        const providers = Object.values(LyriksProviders)
        if (!providers.includes(source)) {
            source = providers.includes(this.options.default!!) ? this.options.default!! : LyriksProviders.AZ_LYRICS
        }

        search = search.trim()
        const cacheKey = `${source}_${search.toLowerCase()}`
        if (this.cache.has(cacheKey)) {
            const { url, title, author, content, searchData, src } = this.cache.get(cacheKey) as CacheLyriks
            return new Lyriks(url, title, author, content, searchData, src)
        }

        const config = LyriksProvidersConfig[source]
        try {
            const hits = await this.search(search, source, config)
            if (hits.length === 0) return null

            const hit = hits[0]
            const parsed = await this.parse(hit.url, source, config)

            const title = parsed.title || hit.title
            const author = parsed.author || hit.author
            const content = parsed.content

            if (!title || !author || !content) return null

            this.cache.set(cacheKey, {
                src: source,
                searchData: search,
                url: hit.url,
                title,
                author,
                content
            })

            return new Lyriks(hit.url, title, author, content, search, source)
        } catch (error) {
            this.emit("parsingError", search, source, error)
            if (this.options.throwErrors) throw error
            return null
        }
    }

    private async search (search: string, source: LyriksProviders, config: ProviderConfig): Promise<SearchHit[]> {
        if (source === LyriksProviders.MusixMatch) {
            return this.searchMusixMatch(search)
        }

        let url = config.search.URL.replace("%s", encodeURIComponent(search))
        if (config.search.requiresToken) {
            url = url.replace("%token%", await this.getAZToken())
        }

        const $ = cheerio.load(await this.fetchText(url, source))
        const hits: SearchHit[] = []

        $(config.search.select).each((_, el) => {
            let href = $(el).attr("href")
            if (!href) return
            const base = config.search.base ?? (config.parse.useURL ? config.parse.URL : undefined)
            if (base && !/^https?:/.test(href)) {
                // Hrefs are often protocol-relative (`//host/path`).
                href = href.startsWith("//")
                    ? `https:${href}`
                    : base + (href.startsWith("/") ? href : `/${href}`)
            }
            if (hits.some(hit => hit.url === href)) return

            // AZLyrics result rows read: `1. "Title" - Artist`
            const label = $(el).text().trim().replace(/^\d+\.\s*/, "")
            const match = label.match(/^"?(.+?)"?\s+-\s+(.+)$/)
            hits.push({
                url: href,
                title: match ? match[1].trim() : label,
                author: match ? match[2].trim() : ""
            })
        })

        return hits
    }

    /**
     * MusixMatch exposes no server-rendered search results, so resolve the
     * artist page and select the best matching track from its payload.
     */
    private async searchMusixMatch (search: string): Promise<SearchHit[]> {
        const artist = await this.resolveMusixMatchArtist(search)
        if (!artist) return []

        const html = await this.fetchText(`https://www.musixmatch.com/artist/${artist}`, LyriksProviders.MusixMatch)
        const data = this.nextData(html)
        const tracks = data?.props?.pageProps?.data?.artistTracksSearch?.data ?? []

        const wanted = search.toLowerCase()
        const scored = tracks
            .filter((track: any) => track?.vanityId && track?.name)
            .map((track: any) => {
                const name = String(track.name).toLowerCase()
                let score = 0
                if (name === wanted) score = 3
                else if (wanted.endsWith(` ${name}`) || wanted.startsWith(`${name} `)) score = 2
                else if (wanted.includes(name)) score = 1
                return { track, score }
            })
            .filter((entry: any) => entry.score > 0)
            .sort((a: any, b: any) => b.score - a.score)

        return scored.map(({ track }: any) => ({
            url: `https://www.musixmatch.com/lyrics/${track.vanityId}`,
            title: track.name,
            author: track.artistName ?? ""
        }))
    }

    /**
     * Pick the most plausible artist vanity id for a free-text query by trying
     * its leading words, e.g. "bohemian rhapsody queen" -> "queen".
     */
    private async resolveMusixMatchArtist (search: string): Promise<string | null> {
        const words = search.split(/\s+/).filter(Boolean)
        const candidates: string[] = []

        const toVanity = (value: string) => value
            .replace(/['’]/g, "")
            .replace(/[^A-Za-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")

        // Try progressively longer leading word groups ("queen", "queen bohemian",
        // ...) so "bohemian rhapsody queen" still finds the artist, then the
        // trailing words and finally the whole phrase.
        for (let n = 1; n < words.length; n++) {
            candidates.push(words.slice(0, n).join(" "))
        }
        if (words.length >= 2) {
            candidates.push(words.slice(-1).join(" "))
        }
        candidates.push(search)

        for (const candidate of candidates) {
            const vanity = toVanity(candidate)
            if (!vanity) continue
            try {
                const html = await this.fetchText(`https://www.musixmatch.com/artist/${vanity}`, LyriksProviders.MusixMatch)
                const data = this.nextData(html)
                const tracks = data?.props?.pageProps?.data?.artistTracksSearch?.data
                if (Array.isArray(tracks) && tracks.length > 0) return vanity
            } catch {
                // Unknown vanity ids answer 403/404; fall through to the next guess.
            }
        }

        return null
    }

    private async parse (url: string, source: LyriksProviders, config: ProviderConfig): Promise<{ title: string, author: string, content: string }> {
        const html = await this.fetchText(url, source)

        if (source === LyriksProviders.MusixMatch) {
            const data = this.nextData(html)
            const trackInfo = data?.props?.pageProps?.data?.trackInfo?.data
            const lyrics = trackInfo?.lyrics?.body ?? ""
            const track = trackInfo?.track ?? {}
            return {
                title: track.trackName ?? track.name ?? "",
                author: track.artistName ?? "",
                content: lyrics.trim()
            }
        }

        const $ = cheerio.load(html)
        return {
            // AZLyrics wraps the song title in quotes inside `div.ringtone ~ b`.
            title: $(config.parse.title).first().text().trim().replace(/^["']|["']$/g, ""),
            // AZLyrics renders the artist as e.g. `Queen Lyrics`.
            author: $(config.parse.author).first().text().trim().replace(/\s+Lyrics$/i, ""),
            content: $(config.parse.content).first().text().trim()
        }
    }

    private nextData (html: string): any {
        const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
        if (!match) return null
        try {
            return JSON.parse(match[1])
        } catch {
            return null
        }
    }

    private async getAZToken (): Promise<string> {
        if (this.#token) return this.#token
        const js = await this.fetchText("https://www.azlyrics.com/geo.js", LyriksProviders.AZ_LYRICS)
        const match = js.match(/[a-f0-9]{32,}/)
        if (!match) throw new Error("Unable to resolve AZLyrics access token")
        this.#token = match[0]
        return this.#token
    }

    private async fetchText (url: string, source?: LyriksProviders): Promise<string> {
        const headers: Record<string, string> = {}
        const config = source ? LyriksProvidersConfig[source] : undefined

        // Provider edges reject a browser-like agent but allow an empty one.
        if (!config?.bypass?.emptyUserAgent) {
            headers["user-agent"] = this.options.userAgent!!
        }

        const res = await fetch(url, {
            headers,
            timeout: this.options.timeout,
            redirect: "follow"
        })
        if (!res.ok) throw new Error(`Request to ${url} failed with status ${res.status}`)
        return res.text()
    }
}

export default LyriksClient
