import { LyriksProviders, ProviderConfig } from "./types"

const configs: Record<LyriksProviders, ProviderConfig> = {
    AZ_LYRICS: {
        // AZLyrics answers a browser-like user agent with a reCAPTCHA wall, but
        // serves normally when the User-Agent header is empty. Search also needs
        // the region token from /geo.js in the `x` parameter, otherwise the
        // results table is omitted from the response.
        search: {
            URL: "https://www.azlyrics.com/search/?q=%s&x=%token%",
            select: "td.visitedlyr a[href*='lyrics/']",
            requiresToken: true
        },
        parse: {
            title: "div.ringtone ~ b",
            author: "div.lyricsh b",
            content: "div.ringtone ~ div",
            useURL: false,
            URL: ""
        },
        bypass: {
            emptyUserAgent: true
        }
    },

    MusixMatch: {
        // The public /search/<query> route is blocked and its results are
        // rendered client side, so search resolves via the artist page and the
        // matching track is taken from the embedded __NEXT_DATA__ payload.
        // Lyrics live in that same payload; the rendered DOM ships empty.
        search: {
            URL: "https://www.musixmatch.com/artist/%s",
            select: "",
            base: "https://www.musixmatch.com"
        },
        parse: {
            title: "",
            author: "",
            content: "",
            useURL: true,
            URL: "https://www.musixmatch.com"
        },
        bypass: {
            emptyUserAgent: true
        }
    },

    LyricsFreak: {
        search: {
            URL: "https://www.lyricsfreak.com/search.php?q=%s",
            select: "a.song[href*='.html']"
        },
        parse: {
            title: "div#breadcrumb span > span[itemprop=title]",
            author: "h2.lyric-song-head a",
            content: "div#content",
            useURL: true,
            URL: "https://www.lyricsfreak.com"
        }
    }

}

export default configs
