import type { CategoryDto } from "@/lib/types";

/**
 * The category system is data, not code — adding a row here adds a browsable
 * shelf to the UI and a valid `category` filter to the API. Each category is
 * expressed as a natural-language query so it runs through exactly the same
 * semantic pipeline as anything a user types.
 */

const c = (
  slug: string,
  label: string,
  kind: CategoryDto["kind"],
  accent: string,
  description: string,
  query: string,
): CategoryDto => ({ slug, label, kind, accent, description, query });

export const MUSIC_CATEGORIES: CategoryDto[] = [
  c("trending", "Trending", "chart", "violet", "What the catalogue is leaning on right now.", "the most popular tracks across every genre right now"),
  c("new-releases", "New Releases", "chart", "sky", "Freshly added to the catalogue.", "recently released tracks from the last two years"),
  c("viral", "Viral", "chart", "rose", "Songs with outsized momentum.", "songs that blew up and became inescapable"),
  c("pop", "Pop", "genre", "fuchsia", "Big hooks, bigger choruses.", "contemporary pop songs with strong hooks"),
  c("rock", "Rock", "genre", "red", "Guitars, drums, volume.", "rock songs with real guitars and drive"),
  c("hip-hop", "Hip-Hop", "genre", "amber", "Rhythm and wordplay.", "hip-hop tracks with sharp writing"),
  c("rap", "Rap", "genre", "orange", "Bars first.", "rap songs built around lyrical skill"),
  c("rnb", "R&B", "genre", "purple", "Smooth, soulful, unhurried.", "smooth modern r&b and neo soul"),
  c("indie", "Indie", "genre", "teal", "Off-centre and guitar-shaped.", "indie and alternative songs with an off-centre feel"),
  c("electronic", "Electronic", "genre", "cyan", "Synths and sequencers.", "electronic music built from synths and programmed drums"),
  c("edm", "EDM", "genre", "blue", "Builds and drops.", "high-energy dance music with big drops"),
  c("jazz", "Jazz", "genre", "yellow", "Improvisation and swing.", "classic jazz recordings with improvisation and swing"),
  c("classical", "Classical", "genre", "stone", "Composed, orchestral, timeless.", "classical and neoclassical pieces for quiet listening"),
  c("country", "Country", "genre", "lime", "Stories with steel guitar.", "country songs with strong storytelling"),
  c("latin", "Latin", "genre", "emerald", "Reggaeton, pop, rhythm.", "latin pop and reggaeton with a strong rhythm"),
  c("k-pop", "K-Pop", "genre", "pink", "Precision-engineered pop.", "k-pop songs with bright production and big hooks"),
  c("bollywood", "Bollywood", "genre", "orange", "Indian film music.", "bollywood and indian film songs"),
  c("chill", "Chill", "mood", "sky", "Low tempo, low stakes.", "calm relaxed music with a slow tempo"),
  c("workout", "Workout", "activity", "red", "Tempo that pushes.", "high-energy motivating music for a workout"),
  c("party", "Party", "activity", "fuchsia", "Made for a crowd.", "upbeat party songs that fill a dancefloor"),
  c("focus", "Focus", "activity", "indigo", "Music that stays out of the way.", "instrumental music for concentration and deep work"),
  c("sleep", "Sleep", "activity", "slate", "Ambient and unhurried.", "ambient calm music for falling asleep"),
  c("sad", "Sad", "mood", "blue", "For when you want to feel it.", "sad emotional songs about heartbreak and loss"),
  c("romantic", "Romantic", "mood", "rose", "Slow dances and devotion.", "romantic love songs for a slow dance"),
];

export const VIDEO_CATEGORIES: CategoryDto[] = [
  c("trending-video", "Trending", "chart", "amber", "Most popular right now.", "the most popular movies and series right now"),
  c("sci-fi", "Sci-Fi", "genre", "cyan", "Ideas, worlds, futures.", "intelligent science fiction with strong world-building"),
  c("thriller", "Thrillers", "genre", "red", "Tension held tight.", "tense thrillers that keep tightening"),
  c("mystery", "Mystery", "genre", "indigo", "Something to solve.", "mystery films and series with a puzzle at the centre"),
  c("crime", "Crime", "genre", "stone", "Investigations and consequences.", "crime dramas about investigations and their cost"),
  c("drama", "Drama", "genre", "violet", "People, closely observed.", "character-driven dramas about ordinary people"),
  c("comedy", "Comedy", "genre", "yellow", "Actually funny.", "genuinely funny comedies"),
  c("romance", "Romance", "genre", "rose", "Love, complicated.", "romantic films about longing and connection"),
  c("animation", "Animation", "genre", "fuchsia", "Drawn and rendered.", "beautifully animated films for all ages"),
  c("horror", "Horror", "genre", "red", "Dread on purpose.", "horror with real atmosphere and dread"),
  c("documentary", "Documentary", "genre", "emerald", "The real thing.", "documentaries about the natural world and real events"),
  c("comfort", "Comfort Watching", "mood", "orange", "Low stakes, high warmth.", "gentle comforting shows to watch after a stressful day"),
  c("weekend-binge", "Weekend Binge", "activity", "purple", "Finishable in two days.", "a short gripping series you can finish over a weekend"),
  c("date-night", "Date Night", "activity", "pink", "Two people, one sofa.", "a film for date night that neither of us will hate"),
  c("family", "Family", "activity", "lime", "Everyone in the room.", "family friendly films everyone can watch together"),
  c("mind-benders", "Mind-Benders", "mood", "indigo", "Bring your attention.", "complex films that require you to pay attention"),
  c("feel-good", "Feel-Good", "mood", "amber", "Ends better than it starts.", "uplifting feel-good films with a warm ending"),
  c("award-winners", "Award Winners", "chart", "yellow", "Critically loaded.", "acclaimed award-winning films and series"),
];

export const ALL_CATEGORIES = [...MUSIC_CATEGORIES, ...VIDEO_CATEGORIES];

export function findCategory(slug: string): CategoryDto | undefined {
  return ALL_CATEGORIES.find((category) => category.slug === slug);
}

/** Rotating placeholder prompts for the hero search field. */
export const EXAMPLE_PROMPTS = [
  "Upbeat pop for a summer drive",
  "A dark mystery series for the weekend",
  "Emotional sci-fi movies like Interstellar and Arrival",
  "Relaxing instrumental music for studying",
  "Energetic pop like Dua Lipa for a workout",
  "Something light and comforting after work",
  "A short thriller I can finish tonight",
  "Smart sci-fi with minimal action",
  "Songs similar to Sabrina Carpenter but more relaxed",
  "Funny movies for a group",
];

export const MUSIC_PROMPTS = [
  "Energetic pop like Dua Lipa for a workout",
  "Sad songs for a rainy evening",
  "Instrumental music that helps me concentrate",
  "Top 50 pop songs trending this month",
  "Something like Sabrina Carpenter but more relaxed",
  "Late-night drive playlist with synths",
];

export const VIDEO_PROMPTS = [
  "A smart psychological thriller",
  "A funny series with episodes under 40 minutes",
  "Visually beautiful sci-fi movies",
  "A crime series similar to Mindhunter",
  "Emotional but not too depressing",
  "Something for date night",
];
