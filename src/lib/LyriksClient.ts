import { EventEmitter } from "events"
import fetch from "node-fetch"
import * as NodeCache from "node-cache"
import * as cheerio from "cheerio"
import Lyriks from "./Lyriks"
import LyriksProvidersConfig from "./LyriksProvidersConfig"
import { CacheLyriks, LyriksClientOptions, LyriksProviders } from "./types"

class LyriksClient extends EventEmitter {
    options: LyriksClientOptions
    cache: NodeCache

    constructor (options: LyriksClientOptions = {}) {
        super()
        this.options = Object.assign({
            userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:63.0) Gecko/20100101 Firefox/63.0",
            timeout: 5000,
            default: LyriksProviders.LyricsFreak,
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
            source = providers.includes(this.options.default!!) ? this.options.default!! : LyriksProviders.LyricsFreak
        }

        search = search.trim()
        const cacheKey = `${source}_${search.toLowerCase()}`
        if (this.cache.has(cacheKey)) {
            const { url, title, author, content, searchData, src } = this.cache.get(cacheKey) as CacheLyriks
            return new Lyriks(url, title, author, content, searchData, src)
        }
        const config = LyriksProvidersConfig[source as keyof typeof LyriksProvidersConfig]
        try {
            if (!config) throw new Error(`${source} is no longer supported: the site blocks automated requests`)

            const searchURL = config.search.URL.replace("%s", encodeURIComponent(search))
            let $ = cheerio.load(await this.fetchText(searchURL))

            const href = $(config.search.select).first().attr("href")
            if (!href) return null
            // Resolves relative and protocol-relative (`//host/path`) links.
            const url = new URL(href, searchURL).href

            $ = cheerio.load(await this.fetchText(url))
            const title = $(config.parse.title).first().text().trim()
            const author = $(config.parse.author).first().text().trim()
            const content = $(config.parse.content).first().text().trim()

            if (!title || !author || !content) return null

            this.cache.set(cacheKey, {
                src: source,
                searchData: search,
                url,
                title,
                author,
                content
            })

            return new Lyriks(url, title, author, content, search, source)
        } catch (error) {
            this.emit("parsingError", search, source, error)
            if (this.options.throwErrors) throw error
            return null
        }
    }

    private async fetchText (url: string): Promise<string> {
        const res = await fetch(url, {
            headers: {
                "user-agent": this.options.userAgent!!
            },
            timeout: this.options.timeout
        })
        if (!res.ok) throw new Error(`Request to ${url} failed with status ${res.status}`)
        return res.text()
    }
}

export default LyriksClient
