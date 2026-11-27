// AZLyrics and MusixMatch were removed: both now block automated requests.
export default {
    LyricsFreak: {
        search: {
            URL: "https://www.lyricsfreak.com/search.php?q=%s",
            select: "a.song[href*='.html']"
        },
        parse: {
            title: "div#breadcrumb span > span[itemprop=title]",
            author: "h2.lyric-song-head a",
            content: "div#content"
        }
    }
}
