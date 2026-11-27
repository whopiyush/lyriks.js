/* eslint-disable no-unused-vars */
export enum LyriksProviders {
    /** @deprecated No longer supported: the site blocks automated requests. */
    AZ_LYRICS = "AZ_LYRICS",
    /** @deprecated No longer supported: the site blocks automated requests. */
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
