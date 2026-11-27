/* eslint-disable no-unused-vars */
export enum LyriksProviders {
    AZ_LYRICS = "AZ_LYRICS",
    MusixMatch= "MusixMatch",
    LyricsFreak= "LyricsFreak",
}

export interface CacheOptions {
    checkPeriod?: number,
    TTL?: number
}

export interface LyriksClientOptions {
    default?: LyriksProviders,
    userAgent?: string,
    timeout?: number,
    cache?: CacheOptions,
    throwErrors?: boolean
}

export interface CacheLyriks {
    url: string,
    title: string,
    author: string,
    content: string,
    searchData: string,
    src: LyriksProviders
}

/**
 * Describes how to reach and parse a provider.
 *
 * `search` describes how to turn a free-text query into a candidate page URL.
 * `parse` describes how to pull title/author/content out of that page.
 * `bypass` marks providers whose edge protection rejects normal browser user
 * agents and which must therefore be requested with an empty user agent.
 */
export interface ProviderConfig {
    search: {
        URL: string,
        select: string,
        /** Resolve the parsed URL relative to this origin when it is not absolute. */
        base?: string,
        /** AZLyrics requires a per-region token from /geo.js on the search URL. */
        requiresToken?: boolean
    },
    parse: {
        title: string,
        author: string,
        content: string,
        useURL: boolean,
        URL: string
    },
    bypass?: {
        emptyUserAgent: boolean
    }
}
