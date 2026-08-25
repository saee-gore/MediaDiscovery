/**
 * Offline music catalogue.
 *
 * The app is designed around the live Spotify Web API, but it must be runnable
 * by someone who has not registered a developer app yet. When SPOTIFY_CLIENT_ID
 * / SPOTIFY_CLIENT_SECRET are absent the ingestion pipeline falls back to this
 * catalogue, and everything downstream — enrichment, embeddings, vector search,
 * charts, playlists — behaves identically.
 *
 * The descriptive fields (moods, themes, audio-feature estimates, prose) are
 * editorial approximations written for semantic retrieval, not measurements.
 * Once real credentials are configured, live Spotify metadata and audio
 * features supersede everything here.
 */

export interface SeedTrack {
  slug: string;
  title: string;
  artist: string;
  album: string;
  /** ISO date, best-effort. */
  released: string;
  /** 0–100, mirrors Spotify's popularity scale. */
  popularity: number;
  genres: string[];
  moods: string[];
  themes: string[];
  /** 0–1 except tempo, which is BPM. */
  energy: number;
  danceability: number;
  valence: number;
  tempo: number;
  description: string;
}

type Features = [energy: number, danceability: number, valence: number, tempo: number];

function t(
  title: string,
  artist: string,
  album: string,
  released: string,
  popularity: number,
  genres: string[],
  moods: string[],
  features: Features,
  themes: string[],
  description: string,
): SeedTrack {
  const slug = `${title}-${artist}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const [energy, danceability, valence, tempo] = features;
  return {
    slug,
    title,
    artist,
    album,
    released,
    popularity,
    genres,
    moods,
    themes,
    energy,
    danceability,
    valence,
    tempo,
    description,
  };
}

export const SEED_TRACKS: SeedTrack[] = [
  // --- Pop / dance-pop -----------------------------------------------------
  t("Levitating", "Dua Lipa", "Future Nostalgia", "2020-03-27", 89, ["pop", "dance pop", "disco"], ["energetic", "upbeat", "confident"], [0.83, 0.7, 0.92, 103], ["dancing", "romance", "celebration"], "Glittering disco-pop built on a nu-disco bassline and a chorus made for a dancefloor."),
  t("Don't Start Now", "Dua Lipa", "Future Nostalgia", "2019-11-01", 86, ["pop", "dance pop", "disco"], ["confident", "energetic", "defiant"], [0.79, 0.79, 0.68, 124], ["moving on", "independence", "dancing"], "A funk-forward breakup anthem that turns walking away into a strut."),
  t("Houdini", "Dua Lipa", "Radical Optimism", "2023-11-09", 80, ["pop", "dance pop", "electropop"], ["playful", "energetic", "flirtatious"], [0.85, 0.75, 0.71, 128], ["chasing", "attraction", "escape"], "Psychedelic-tinged dance-pop with a restless, chase-me pulse."),
  t("Training Season", "Dua Lipa", "Radical Optimism", "2024-02-15", 78, ["pop", "dance pop"], ["confident", "assertive", "energetic"], [0.8, 0.76, 0.6, 118], ["dating", "standards", "self-worth"], "Sharp-edged pop about being done teaching people how to treat you."),
  t("Dance The Night", "Dua Lipa", "Barbie The Album", "2023-05-25", 82, ["pop", "dance pop", "disco"], ["euphoric", "upbeat", "glamorous"], [0.84, 0.67, 0.78, 110], ["dancing", "resilience", "performance"], "Widescreen disco-pop about keeping the smile on while the heart breaks."),
  t("Blinding Lights", "The Weeknd", "After Hours", "2019-11-29", 92, ["pop", "synth-pop", "r&b"], ["energetic", "nostalgic", "urgent"], [0.73, 0.51, 0.33, 171], ["late night", "longing", "driving"], "Eighties synth-pop revival with a neon-lit, midnight-drive momentum."),
  t("Save Your Tears", "The Weeknd", "After Hours", "2020-08-14", 85, ["pop", "synth-pop"], ["bittersweet", "reflective", "upbeat"], [0.83, 0.68, 0.64, 118], ["regret", "heartbreak", "nightlife"], "A bright synth-pop surface over a genuinely rueful lyric."),
  t("Die For You", "The Weeknd", "Starboy", "2016-11-25", 84, ["r&b", "pop", "alternative r&b"], ["yearning", "moody", "romantic"], [0.6, 0.59, 0.51, 134], ["devotion", "heartbreak", "obsession"], "Slow-burning devotional R&B with a hazy, weightless production."),
  t("Starboy", "The Weeknd", "Starboy", "2016-09-21", 83, ["r&b", "pop", "electronic"], ["dark", "confident", "sleek"], [0.59, 0.68, 0.49, 186], ["fame", "excess", "reinvention"], "Daft Punk-produced electro-R&B about the cost of a new persona."),
  t("As It Was", "Harry Styles", "Harry's House", "2022-04-01", 90, ["pop", "synth-pop", "indie pop"], ["wistful", "bittersweet", "upbeat"], [0.73, 0.52, 0.66, 174], ["change", "distance", "growing up"], "Buoyant synth-pop that hides a lyric about everything quietly shifting."),
  t("Watermelon Sugar", "Harry Styles", "Fine Line", "2019-11-16", 84, ["pop", "pop rock"], ["sunny", "sensual", "carefree"], [0.82, 0.55, 0.56, 95], ["summer", "desire", "warmth"], "Brass-lifted summer pop about wanting somebody in the heat."),
  t("Golden", "Harry Styles", "Fine Line", "2019-12-13", 79, ["pop", "pop rock", "indie pop"], ["euphoric", "hopeful", "warm"], [0.78, 0.55, 0.65, 140], ["freedom", "love", "coastline"], "Windows-down opener with a chorus that sounds like a coastal highway."),
  t("Espresso", "Sabrina Carpenter", "Short n' Sweet", "2024-04-11", 88, ["pop", "dance pop", "disco"], ["playful", "flirtatious", "sunny"], [0.72, 0.8, 0.83, 104], ["confidence", "flirting", "summer"], "Breezy, wink-heavy summer pop with a bassline that never stops grinning."),
  t("Please Please Please", "Sabrina Carpenter", "Short n' Sweet", "2024-06-06", 85, ["pop", "country pop"], ["wry", "anxious", "charming"], [0.6, 0.66, 0.55, 108], ["bad boyfriends", "embarrassment", "pleading"], "A twangy pop plea aimed at a partner who keeps embarrassing her."),
  t("Taste", "Sabrina Carpenter", "Short n' Sweet", "2024-08-23", 82, ["pop", "pop rock"], ["snarky", "confident", "playful"], [0.71, 0.7, 0.62, 116], ["exes", "rivalry", "wit"], "Glossy pop-rock about lingering in an ex's new relationship."),
  t("Feather", "Sabrina Carpenter", "emails i can't send fwd:", "2023-07-14", 78, ["pop", "dance pop"], ["light", "liberated", "upbeat"], [0.74, 0.79, 0.8, 120], ["moving on", "lightness", "freedom"], "Airy dance-pop about how weightless it feels once someone's gone."),
  t("Anti-Hero", "Taylor Swift", "Midnights", "2022-10-21", 89, ["pop", "synth-pop"], ["self-aware", "melancholy", "wry"], [0.64, 0.64, 0.53, 97], ["self-loathing", "anxiety", "fame"], "Bedroom-synth pop that turns self-criticism into an arena chorus."),
  t("Cruel Summer", "Taylor Swift", "Lover", "2019-08-23", 91, ["pop", "synth-pop", "electropop"], ["euphoric", "anxious", "romantic"], [0.7, 0.55, 0.56, 170], ["secret love", "summer", "risk"], "Sweaty, panicked, exhilarated synth-pop about a love kept quiet."),
  t("Fortnight", "Taylor Swift", "The Tortured Poets Department", "2024-04-19", 80, ["pop", "synth-pop"], ["melancholy", "dreamy", "restrained"], [0.45, 0.5, 0.28, 96], ["obsession", "regret", "suburbia"], "Muted, narcotic synth-pop about a fortnight that never really ended."),
  t("Lover", "Taylor Swift", "Lover", "2019-08-16", 81, ["pop", "country pop"], ["romantic", "tender", "warm"], [0.36, 0.47, 0.45, 68], ["marriage", "devotion", "home"], "A slow-waltz love song built like a promise read aloud."),
  t("Good Luck, Babe!", "Chappell Roan", "Good Luck, Babe!", "2024-04-05", 86, ["pop", "synth-pop"], ["dramatic", "yearning", "defiant"], [0.75, 0.62, 0.5, 117], ["denial", "queer love", "inevitability"], "Eighties-scale synth-pop aimed at someone refusing to admit what they want."),
  t("Pink Pony Club", "Chappell Roan", "The Rise and Fall of a Midwest Princess", "2020-04-03", 79, ["pop", "synth-pop", "dance pop"], ["euphoric", "bittersweet", "theatrical"], [0.7, 0.58, 0.62, 128], ["belonging", "leaving home", "queer joy"], "A neon coming-of-age story about finding a stage far from home."),
  t("HOT TO GO!", "Chappell Roan", "The Rise and Fall of a Midwest Princess", "2023-08-11", 77, ["pop", "dance pop", "synth-pop"], ["playful", "energetic", "campy"], [0.86, 0.74, 0.85, 130], ["flirting", "crowds", "fun"], "Cheerleader-chant pop engineered to be shouted back at a festival."),
  t("Flowers", "Miley Cyrus", "Endless Summer Vacation", "2023-01-12", 87, ["pop", "dance pop", "disco"], ["defiant", "liberated", "smooth"], [0.68, 0.71, 0.65, 118], ["self-love", "divorce", "independence"], "A cool-headed self-sufficiency anthem over a easy disco groove."),
  t("Vampire", "Olivia Rodrigo", "GUTS", "2023-06-30", 83, ["pop", "pop rock", "piano pop"], ["furious", "theatrical", "wounded"], [0.62, 0.51, 0.29, 138], ["betrayal", "manipulation", "revenge"], "A piano ballad that escalates into a full-throated accusation."),
  t("good 4 u", "Olivia Rodrigo", "SOUR", "2021-05-14", 86, ["pop punk", "pop rock", "pop"], ["angry", "energetic", "sarcastic"], [0.66, 0.56, 0.69, 169], ["breakup", "jealousy", "rage"], "Pop-punk fury dressed as a congratulations card."),
  t("drivers license", "Olivia Rodrigo", "SOUR", "2021-01-08", 84, ["pop", "piano pop"], ["heartbroken", "cinematic", "sad"], [0.43, 0.59, 0.13, 144], ["heartbreak", "suburbs", "first love"], "A slow, filmic breakup ballad about driving past someone's house."),
  t("Kill Bill", "SZA", "SOS", "2022-12-09", 88, ["r&b", "pop", "alternative r&b"], ["deadpan", "dark", "smooth"], [0.55, 0.64, 0.42, 89], ["jealousy", "obsession", "dark humour"], "Silky R&B that delivers a murder fantasy in the calmest possible voice."),
  t("Snooze", "SZA", "SOS", "2022-12-09", 84, ["r&b", "alternative r&b"], ["tender", "devoted", "warm"], [0.43, 0.55, 0.45, 143], ["devotion", "intimacy", "loyalty"], "Hushed, hypnotic R&B about never wanting to miss a moment with someone."),
  t("Good Days", "SZA", "Good Days", "2020-12-25", 80, ["r&b", "alternative r&b", "neo soul"], ["dreamy", "hopeful", "hazy"], [0.42, 0.44, 0.41, 121], ["healing", "letting go", "peace"], "Weightless, sun-through-curtains R&B about waiting for the mood to lift."),
  t("Paint The Town Red", "Doja Cat", "Scarlet", "2023-08-04", 82, ["hip-hop", "pop rap"], ["defiant", "cool", "sardonic"], [0.6, 0.86, 0.7, 100], ["fame", "reputation", "control"], "A sample-flipping rap-pop shrug at everyone's opinion."),
  t("Say So", "Doja Cat", "Hot Pink", "2019-11-07", 80, ["pop", "disco", "funk"], ["flirtatious", "smooth", "upbeat"], [0.67, 0.79, 0.78, 111], ["flirting", "dancing", "confidence"], "Nu-disco pop that glides on a bassline and a raised eyebrow."),
  t("Bad Guy", "Billie Eilish", "When We All Fall Asleep, Where Do We Go?", "2019-03-29", 85, ["pop", "electropop", "alternative"], ["sly", "dark", "playful"], [0.43, 0.7, 0.56, 135], ["menace", "irony", "power"], "Minimal bass-driven pop delivered almost entirely in a whisper."),
  t("Birds of a Feather", "Billie Eilish", "Hit Me Hard and Soft", "2024-05-17", 88, ["pop", "indie pop"], ["tender", "devoted", "warm"], [0.55, 0.62, 0.6, 105], ["lifelong love", "mortality", "devotion"], "A soft, sunlit pop song about loving someone until the very end."),
  t("Lunch", "Billie Eilish", "Hit Me Hard and Soft", "2024-05-17", 79, ["pop", "alternative", "electropop"], ["hungry", "playful", "restless"], [0.68, 0.7, 0.6, 122], ["desire", "queer love", "appetite"], "Twitchy bass-pop about wanting someone with no self-consciousness at all."),
  t("Happier Than Ever", "Billie Eilish", "Happier Than Ever", "2021-07-30", 81, ["pop", "alternative", "rock"], ["cathartic", "furious", "bittersweet"], [0.55, 0.34, 0.24, 81], ["release", "resentment", "freedom"], "A ukulele lament that detonates into distorted rock catharsis."),
  t("Greedy", "Tate McRae", "Think Later", "2023-09-15", 84, ["pop", "dance pop"], ["confident", "flirtatious", "energetic"], [0.79, 0.77, 0.68, 111], ["self-assurance", "flirting", "attention"], "Punchy dance-pop about knowing exactly how wanted you are."),
  t("exes", "Tate McRae", "Think Later", "2023-11-17", 74, ["pop", "dance pop"], ["sardonic", "energetic", "cool"], [0.78, 0.75, 0.6, 116], ["exes", "detachment", "nightlife"], "Club-lit pop that keeps a running tally of people who didn't work out."),
  t("Lose Control", "Teddy Swims", "I've Tried Everything But Therapy", "2023-06-23", 85, ["pop", "soul", "r&b"], ["desperate", "soulful", "raw"], [0.63, 0.6, 0.34, 152], ["dependency", "longing", "unravelling"], "Big-voiced soul-pop about coming apart without somebody around."),
  t("Beautiful Things", "Benson Boone", "Fireworks & Rollerblades", "2024-01-18", 86, ["pop", "pop rock"], ["grateful", "anxious", "soaring"], [0.72, 0.5, 0.45, 105], ["gratitude", "fear of loss", "faith"], "A whisper-to-roar pop-rock plea to keep the good things from leaving."),
  t("Stick Season", "Noah Kahan", "Stick Season", "2022-07-08", 83, ["folk pop", "indie folk", "pop"], ["restless", "melancholy", "raw"], [0.66, 0.55, 0.4, 118], ["small towns", "heartbreak", "seasons"], "Stomping folk-pop about the grey months between autumn and snow."),
  t("I Had Some Help", "Post Malone", "F-1 Trillion", "2024-05-10", 84, ["country", "country pop"], ["rowdy", "wry", "energetic"], [0.8, 0.65, 0.6, 128], ["blame", "breakups", "drinking"], "A stadium-country duet that splits the blame straight down the middle."),
  t("Too Sweet", "Hozier", "Unheard", "2024-03-22", 83, ["alternative", "blues rock", "indie"], ["wry", "smoky", "cool"], [0.6, 0.7, 0.55, 116], ["mismatched habits", "night owls", "romance"], "A late-night blues-rock groove about two incompatible daily rhythms."),
  t("Sunflower", "Post Malone", "Spider-Man: Into the Spider-Verse", "2018-10-18", 87, ["hip-hop", "pop rap"], ["breezy", "warm", "bittersweet"], [0.52, 0.76, 0.91, 90], ["loyalty", "worry", "friendship"], "Feather-light rap-pop with an unshakeable, sunny hook."),
  t("Circles", "Post Malone", "Hollywood's Bleeding", "2019-08-30", 84, ["pop", "pop rock"], ["melancholy", "mellow", "resigned"], [0.6, 0.7, 0.55, 120], ["cycles", "letting go", "regret"], "A soft-rock loop about a relationship that keeps returning to the same place."),
  t("Stay", "The Kid LAROI", "F*CK LOVE 3: OVER YOU", "2021-07-09", 85, ["pop", "hip-hop", "pop rap"], ["frantic", "desperate", "energetic"], [0.76, 0.59, 0.48, 170], ["dependency", "apology", "panic"], "Breathless pop-rap begging someone not to walk out the door."),
  t("Peaches", "Justin Bieber", "Justice", "2021-03-19", 79, ["r&b", "pop"], ["smooth", "content", "sunny"], [0.7, 0.68, 0.46, 90], ["contentment", "california", "love"], "Laid-back R&B pop that mostly wants you to know things are good."),
  t("Shivers", "Ed Sheeran", "=", "2021-09-10", 82, ["pop", "dance pop"], ["giddy", "energetic", "romantic"], [0.86, 0.79, 0.82, 141], ["attraction", "dancing", "summer"], "A gleeful, sprinting pop song about wanting somebody immediately."),
  t("Shape of You", "Ed Sheeran", "÷", "2017-01-06", 88, ["pop", "dancehall pop"], ["flirtatious", "upbeat", "catchy"], [0.65, 0.83, 0.93, 96], ["attraction", "bars", "dancing"], "Marimba-hooked pop with a dancehall lilt and an inescapable chorus."),
  t("Perfect", "Ed Sheeran", "÷", "2017-09-26", 86, ["pop", "soft pop"], ["romantic", "tender", "sentimental"], [0.45, 0.6, 0.17, 95], ["marriage", "devotion", "slow dance"], "A first-dance waltz written to be played at weddings forever."),
  t("About Damn Time", "Lizzo", "Special", "2022-04-14", 80, ["pop", "funk", "disco"], ["joyful", "confident", "energetic"], [0.74, 0.84, 0.71, 109], ["recovery", "celebration", "self-worth"], "Funk-revival pop about finally feeling good again, and saying so."),
  t("Break My Soul", "Beyoncé", "RENAISSANCE", "2022-06-20", 78, ["house", "dance", "pop"], ["liberated", "driving", "euphoric"], [0.88, 0.79, 0.68, 115], ["quitting", "release", "self-reliance"], "Nineties house revival built as a permission slip to walk away."),
  t("Cuff It", "Beyoncé", "RENAISSANCE", "2022-07-29", 81, ["funk", "disco", "r&b"], ["euphoric", "flirtatious", "warm"], [0.8, 0.78, 0.79, 115], ["nightlife", "desire", "celebration"], "Nile Rodgers-shaped disco-funk about a night getting delightfully out of hand."),
  t("Texas Hold 'Em", "Beyoncé", "COWBOY CARTER", "2024-02-11", 80, ["country", "country pop"], ["playful", "rowdy", "sunny"], [0.71, 0.73, 0.72, 110], ["dancing", "storms", "hometown"], "Banjo-driven country-pop invitation to the dancefloor."),
  t("Unholy", "Sam Smith", "Gloria", "2022-09-22", 79, ["pop", "electropop", "dance"], ["dark", "theatrical", "sultry"], [0.7, 0.71, 0.24, 131], ["infidelity", "secrets", "temptation"], "A choral, industrial-edged pop confession about somebody's double life."),
  t("Calm Down", "Rema", "Rave & Roses", "2022-02-11", 84, ["afrobeats", "pop", "afropop"], ["breezy", "romantic", "warm"], [0.65, 0.8, 0.79, 107], ["flirting", "parties", "attraction"], "Sun-warmed Afrobeats about spotting someone across a crowded room."),
  t("Water", "Tyla", "TYLA", "2023-07-28", 82, ["amapiano", "afropop", "r&b"], ["sultry", "cool", "hypnotic"], [0.68, 0.85, 0.66, 113], ["desire", "dancing", "heat"], "Amapiano-driven pop with a log-drum pulse and a whispered hook."),
  t("Heat Waves", "Glass Animals", "Dreamland", "2020-06-29", 85, ["indie pop", "psychedelic pop"], ["nostalgic", "hazy", "bittersweet"], [0.53, 0.76, 0.53, 81], ["memory", "summer", "loss"], "Sun-bleached indie-pop about a memory that will not cool down."),
  t("abcdefu", "GAYLE", "a study of the human experience volume one", "2021-08-13", 74, ["pop", "pop rock"], ["angry", "sardonic", "energetic"], [0.7, 0.69, 0.47, 122], ["breakup", "spite", "release"], "A gleefully petty kiss-off with a garage-pop snarl."),
  t("Made You Look", "Meghan Trainor", "Takin' It Back", "2022-10-21", 75, ["pop", "doo-wop pop"], ["confident", "playful", "sunny"], [0.72, 0.8, 0.85, 110], ["self-confidence", "flirting", "style"], "Retro-leaning pop about being just as good without the designer labels."),
  t("Agora Hills", "Doja Cat", "Scarlet", "2023-09-22", 76, ["hip-hop", "r&b", "pop rap"], ["dreamy", "affectionate", "hazy"], [0.5, 0.72, 0.5, 88], ["public affection", "romance", "fame"], "Woozy, love-drunk rap about wanting to be obvious about somebody."),

  // --- Rock ----------------------------------------------------------------
  t("Bohemian Rhapsody", "Queen", "A Night at the Opera", "1975-10-31", 84, ["rock", "classic rock", "progressive rock"], ["theatrical", "epic", "dramatic"], [0.4, 0.39, 0.23, 72], ["guilt", "fate", "opera"], "A six-minute suite that swerves from ballad to opera to hard rock."),
  t("Everlong", "Foo Fighters", "The Colour and the Shape", "1997-08-18", 78, ["rock", "alternative rock", "post-grunge"], ["urgent", "romantic", "driving"], [0.92, 0.43, 0.5, 158], ["longing", "dreams", "intensity"], "Relentless alt-rock that sounds like someone running toward something."),
  t("Mr. Brightside", "The Killers", "Hot Fuss", "2004-09-29", 86, ["rock", "indie rock", "alternative rock"], ["frantic", "jealous", "anthemic"], [0.92, 0.35, 0.24, 148], ["jealousy", "nightlife", "obsession"], "A jealousy spiral set to the most singable riff of its decade."),
  t("Seven Nation Army", "The White Stripes", "Elephant", "2003-03-01", 82, ["rock", "garage rock", "blues rock"], ["menacing", "driving", "raw"], [0.46, 0.74, 0.32, 124], ["defiance", "rumours", "leaving"], "Two people, one riff, and the most recognisable bassline in a stadium."),
  t("Smells Like Teen Spirit", "Nirvana", "Nevermind", "1991-09-10", 83, ["rock", "grunge", "alternative rock"], ["angry", "restless", "raw"], [0.91, 0.5, 0.72, 117], ["apathy", "youth", "rebellion"], "The song that dragged distorted apathy into the mainstream."),
  t("Under the Bridge", "Red Hot Chili Peppers", "Blood Sugar Sex Magik", "1991-09-24", 79, ["rock", "alternative rock", "funk rock"], ["melancholy", "reflective", "lonely"], [0.46, 0.56, 0.47, 85], ["loneliness", "addiction", "city"], "A confession of loneliness addressed to a whole city."),

  // --- Indie ---------------------------------------------------------------
  t("The Less I Know The Better", "Tame Impala", "Currents", "2015-07-17", 83, ["indie", "psychedelic pop", "indie rock"], ["wry", "groovy", "melancholy"], [0.74, 0.64, 0.79, 117], ["jealousy", "letting go", "desire"], "A bassline you can dance to attached to a story you'd rather not hear."),
  t("Somebody Else", "The 1975", "I Like It When You Sleep...", "2016-02-15", 78, ["indie pop", "synth-pop", "alternative"], ["melancholy", "detached", "yearning"], [0.58, 0.61, 0.24, 111], ["jealousy", "moving on", "nightlife"], "Cool synths and warm hurt: watching someone become somebody else's."),
  t("Ribs", "Lorde", "Pure Heroine", "2013-09-27", 77, ["indie pop", "electropop", "alternative"], ["anxious", "nostalgic", "euphoric"], [0.6, 0.55, 0.31, 122], ["growing up", "friendship", "fear"], "A house-party panic attack about getting older, built from loops and echo."),
  t("Fluorescent Adolescent", "Arctic Monkeys", "Favourite Worst Nightmare", "2007-07-09", 76, ["indie rock", "britpop", "alternative"], ["wry", "nostalgic", "bouncy"], [0.72, 0.63, 0.72, 100], ["ageing", "regret", "nightlife"], "Sharp-tongued indie rock about romance that peaked years ago."),
  t("Sofia", "Clairo", "Immunity", "2019-08-02", 74, ["indie pop", "bedroom pop"], ["dreamy", "fond", "warm"], [0.62, 0.68, 0.6, 130], ["queer love", "crushes", "youth"], "Fuzzy bedroom-pop about a crush that never quite got said out loud."),
  t("Take a Walk", "Passion Pit", "Gossamer", "2012-06-12", 70, ["indie pop", "electropop", "synth-pop"], ["bright", "bittersweet", "energetic"], [0.8, 0.6, 0.62, 127], ["immigration", "family", "money"], "Sunlit synth-pop hiding three generations of financial anxiety."),

  // --- Hip-hop / rap -------------------------------------------------------
  t("HUMBLE.", "Kendrick Lamar", "DAMN.", "2017-03-30", 85, ["hip-hop", "rap", "west coast rap"], ["aggressive", "confident", "sharp"], [0.62, 0.9, 0.42, 150], ["ego", "authenticity", "power"], "A minimal piano loop and a demand that everyone sit down."),
  t("Not Like Us", "Kendrick Lamar", "Not Like Us", "2024-05-04", 89, ["hip-hop", "west coast rap"], ["defiant", "celebratory", "cutting"], [0.75, 0.9, 0.61, 101], ["rivalry", "los angeles", "pride"], "A diss record that turned into a city-wide block party."),
  t("N95", "Kendrick Lamar", "Mr. Morale & The Big Steppers", "2022-05-13", 78, ["hip-hop", "rap"], ["biting", "restless", "confrontational"], [0.7, 0.78, 0.4, 108], ["hypocrisy", "status", "identity"], "A stripped-away, everything-off indictment of borrowed identities."),
  t("SICKO MODE", "Travis Scott", "ASTROWORLD", "2018-08-03", 84, ["hip-hop", "trap", "rap"], ["chaotic", "dark", "energetic"], [0.73, 0.83, 0.45, 155], ["nightlife", "excess", "fame"], "Three beat switches stitched into one restless, maximalist trap epic."),
  t("God's Plan", "Drake", "Scorpion", "2018-01-19", 85, ["hip-hop", "rap", "pop rap"], ["reflective", "smooth", "assured"], [0.45, 0.75, 0.36, 77], ["fate", "generosity", "success"], "Melodic rap about ambition, luck and the people who wished otherwise."),
  t("First Person Shooter", "Drake", "For All The Dogs", "2023-10-06", 76, ["hip-hop", "rap"], ["competitive", "confident", "playful"], [0.66, 0.78, 0.5, 141], ["rivalry", "legacy", "status"], "A victory-lap duet about who is actually at the top."),

  // --- R&B / soul ----------------------------------------------------------
  t("Best Part", "Daniel Caesar", "Freudian", "2017-08-25", 79, ["r&b", "neo soul"], ["tender", "intimate", "warm"], [0.32, 0.5, 0.44, 78], ["devotion", "morning", "gratitude"], "A hushed duet that treats another person as daylight."),
  t("Redbone", "Childish Gambino", "Awaken, My Love!", "2016-11-17", 82, ["r&b", "funk", "psychedelic soul"], ["paranoid", "sultry", "hazy"], [0.34, 0.74, 0.36, 160], ["suspicion", "infidelity", "night"], "Slow-motion psychedelic soul that tells you to stay woke."),
  t("Adorn", "Miguel", "Kaleidoscope Dream", "2012-07-27", 74, ["r&b", "neo soul"], ["sensual", "smooth", "devoted"], [0.55, 0.75, 0.66, 110], ["desire", "devotion", "touch"], "Marvin Gaye-shaped modern R&B built around one irresistible bassline."),
  t("Essence", "Wizkid", "Made in Lagos", "2020-10-30", 80, ["afrobeats", "r&b", "afropop"], ["sultry", "breezy", "romantic"], [0.55, 0.78, 0.63, 107], ["desire", "summer", "romance"], "The Afrobeats slow-burn that became a global summer standard."),

  // --- Electronic / EDM ----------------------------------------------------
  t("Titanium", "David Guetta", "Nothing but the Beat", "2011-08-08", 82, ["edm", "electro house", "dance"], ["triumphant", "resilient", "soaring"], [0.79, 0.6, 0.34, 126], ["resilience", "strength", "defiance"], "A house build-and-drop wrapped around an unbreakable vocal."),
  t("Midnight City", "M83", "Hurry Up, We're Dreaming", "2011-08-16", 80, ["electronic", "synth-pop", "dream pop"], ["euphoric", "nocturnal", "nostalgic"], [0.76, 0.63, 0.44, 105], ["cities", "night", "youth"], "A saxophone-crowned synth anthem for a city seen at speed."),
  t("Strobe", "deadmau5", "For Lack of a Better Name", "2009-09-22", 71, ["progressive house", "electronic"], ["hypnotic", "patient", "euphoric"], [0.7, 0.5, 0.2, 128], ["patience", "sunrise", "release"], "Ten minutes of progressive house that takes its time on purpose."),
  t("One More Time", "Daft Punk", "Discovery", "2000-11-13", 83, ["house", "french house", "electronic"], ["euphoric", "celebratory", "warm"], [0.7, 0.62, 0.48, 123], ["celebration", "dancing", "joy"], "Filtered French house designed to make a crowd raise its hands."),
  t("Where Are Ü Now", "Jack Ü", "Skrillex and Diplo Present Jack Ü", "2015-02-27", 74, ["edm", "future bass", "electronic"], ["yearning", "glitchy", "bittersweet"], [0.65, 0.6, 0.4, 140], ["absence", "longing", "regret"], "A pitched-vocal future-bass turn that rebuilt a pop career."),
  t("Rather Be", "Clean Bandit", "New Eyes", "2014-01-17", 77, ["dance", "electronic", "pop"], ["joyful", "warm", "uplifting"], [0.77, 0.75, 0.75, 121], ["home", "devotion", "travel"], "String-led dance-pop about there being nowhere else worth going."),

  // --- Jazz ----------------------------------------------------------------
  t("So What", "Miles Davis", "Kind of Blue", "1959-08-17", 72, ["jazz", "modal jazz"], ["cool", "spacious", "contemplative"], [0.3, 0.5, 0.4, 136], ["improvisation", "space", "restraint"], "The opening statement of modal jazz, two chords and infinite room."),
  t("Take Five", "The Dave Brubeck Quartet", "Time Out", "1959-12-14", 74, ["jazz", "cool jazz"], ["cool", "playful", "elegant"], [0.35, 0.62, 0.6, 174], ["rhythm", "conversation", "swing"], "Five-four time made so easy it sounds like it was always there."),
  t("My Favorite Things", "John Coltrane", "My Favorite Things", "1961-03-01", 68, ["jazz", "modal jazz"], ["hypnotic", "searching", "elegant"], [0.4, 0.45, 0.5, 168], ["transformation", "repetition", "joy"], "A show tune stretched into thirteen minutes of spiralling soprano sax."),
  t("Feeling Good", "Nina Simone", "I Put a Spell on You", "1965-06-01", 78, ["jazz", "soul", "vocal jazz"], ["triumphant", "liberated", "smoky"], [0.4, 0.4, 0.5, 130], ["freedom", "new beginnings", "dawn"], "A brass-lifted declaration of a brand new day."),

  // --- Classical -----------------------------------------------------------
  t("Clair de Lune", "Claude Debussy", "Suite bergamasque", "1905-01-01", 70, ["classical", "impressionist"], ["serene", "dreamy", "tender"], [0.1, 0.2, 0.3, 72], ["moonlight", "stillness", "reverie"], "Impressionist piano that moves like light on water."),
  t("Gymnopédie No. 1", "Erik Satie", "Trois Gymnopédies", "1888-01-01", 72, ["classical", "minimalism", "piano"], ["calm", "melancholy", "spacious"], [0.08, 0.25, 0.25, 60], ["stillness", "solitude", "melancholy"], "Three slow chords a bar, and somehow an entire mood."),
  t("Nocturne Op. 9 No. 2", "Frédéric Chopin", "Nocturnes", "1832-01-01", 71, ["classical", "romantic", "piano"], ["romantic", "wistful", "elegant"], [0.12, 0.3, 0.35, 66], ["night", "longing", "grace"], "The nocturne that taught the piano how to sigh."),
  t("The Four Seasons: Spring", "Antonio Vivaldi", "The Four Seasons", "1725-01-01", 73, ["classical", "baroque"], ["bright", "energetic", "joyful"], [0.5, 0.4, 0.8, 108], ["nature", "renewal", "birdsong"], "Baroque strings imitating birds, brooks and a storm passing through."),

  // --- Country -------------------------------------------------------------
  t("Tennessee Whiskey", "Chris Stapleton", "Traveller", "2015-05-04", 84, ["country", "southern soul", "blues"], ["smoky", "romantic", "slow"], [0.4, 0.47, 0.4, 98], ["devotion", "sobriety", "love"], "A country-soul slow dance carried entirely by one voice."),
  t("The Bones", "Maren Morris", "GIRL", "2019-03-08", 74, ["country", "country pop"], ["steady", "warm", "reassuring"], [0.55, 0.6, 0.6, 106], ["marriage", "resilience", "foundations"], "A marriage metaphor built out of load-bearing walls."),
  t("Fast Car", "Luke Combs", "Gettin' Old", "2023-03-24", 81, ["country", "country pop"], ["wistful", "hopeful", "worn"], [0.5, 0.6, 0.45, 103], ["escape", "poverty", "dreams"], "A faithful country reading of a song about getting out."),

  // --- Latin ---------------------------------------------------------------
  t("Despacito", "Luis Fonsi", "VIDA", "2017-01-12", 85, ["latin", "reggaeton", "latin pop"], ["sultry", "celebratory", "warm"], [0.79, 0.66, 0.85, 89], ["desire", "dancing", "slowness"], "The reggaeton-pop crossover that took over an entire summer."),
  t("Tití Me Preguntó", "Bad Bunny", "Un Verano Sin Ti", "2022-05-06", 83, ["latin", "reggaeton", "dembow"], ["restless", "playful", "energetic"], [0.72, 0.65, 0.55, 106], ["commitment", "dating", "family"], "A dembow sprint through every name his aunt keeps asking about."),
  t("DÁKITI", "Bad Bunny", "EL ÚLTIMO TOUR DEL MUNDO", "2020-10-30", 80, ["latin", "reggaeton", "electronic"], ["cool", "hypnotic", "nocturnal"], [0.6, 0.73, 0.4, 110], ["nightlife", "desire", "luxury"], "Icy, minimal reggaeton built for a very late night."),
  t("Bailando", "Enrique Iglesias", "Sex and Love", "2014-04-08", 78, ["latin", "latin pop", "flamenco pop"], ["passionate", "warm", "danceable"], [0.78, 0.72, 0.78, 122], ["dancing", "desire", "rhythm"], "Flamenco guitar and a chorus engineered for a wedding floor."),

  // --- K-Pop ---------------------------------------------------------------
  t("Dynamite", "BTS", "Dynamite", "2020-08-21", 84, ["k-pop", "pop", "disco"], ["joyful", "bright", "energetic"], [0.77, 0.75, 0.74, 114], ["joy", "celebration", "resilience"], "Retro disco-pop written as a deliberate shot of serotonin."),
  t("How You Like That", "BLACKPINK", "THE ALBUM", "2020-06-26", 79, ["k-pop", "pop", "trap"], ["fierce", "dramatic", "confident"], [0.8, 0.81, 0.45, 130], ["comeback", "defiance", "power"], "A hard-switching K-pop statement piece with a stomping drop."),
  t("Super Shy", "NewJeans", "Get Up", "2023-07-07", 81, ["k-pop", "jersey club", "pop"], ["giddy", "shy", "bouncy"], [0.75, 0.82, 0.8, 150], ["crushes", "nerves", "youth"], "Jersey-club drums under the sweetest possible case of nerves."),
  t("Magnetic", "ILLIT", "SUPER REAL ME", "2024-03-25", 76, ["k-pop", "pop", "jersey club"], ["bubbly", "bright", "playful"], [0.78, 0.8, 0.85, 148], ["attraction", "first love", "energy"], "Featherweight, hyper-bright K-pop with an unshakeable hook."),

  // --- Bollywood / Indian --------------------------------------------------
  t("Kesariya", "Arijit Singh", "Brahmastra", "2022-07-17", 82, ["bollywood", "hindi film", "pop"], ["romantic", "sweeping", "warm"], [0.55, 0.55, 0.6, 96], ["love", "colour", "devotion"], "A saffron-hued Hindi film romance with a chorus made for crowds."),
  t("Chaiyya Chaiyya", "Sukhwinder Singh", "Dil Se..", "1998-07-21", 78, ["bollywood", "hindi film", "sufi"], ["ecstatic", "rhythmic", "joyful"], [0.85, 0.75, 0.8, 130], ["journeys", "trains", "devotion"], "Sufi-inflected film music that turned a moving train into a dancefloor."),
  t("Naatu Naatu", "Rahul Sipligunj", "RRR", "2021-11-09", 81, ["tollywood", "telugu film", "dance"], ["frenetic", "joyful", "competitive"], [0.93, 0.8, 0.85, 145], ["friendship", "dance battle", "defiance"], "A breakneck dance number built to exhaust everyone in the room."),
  t("Apna Bana Le", "Arijit Singh", "Bhediya", "2022-11-14", 78, ["bollywood", "hindi film"], ["tender", "yearning", "gentle"], [0.4, 0.5, 0.5, 92], ["belonging", "love", "home"], "A soft plea to be claimed as somebody's own."),

  // --- Chill / focus / sleep ----------------------------------------------
  t("Weightless", "Marconi Union", "Weightless", "2011-11-01", 62, ["ambient", "electronic", "chill"], ["calm", "spacious", "hypnotic"], [0.08, 0.2, 0.15, 60], ["relaxation", "breathing", "stillness"], "Ambient music engineered with therapists to slow a heart rate down."),
  t("Intro", "The xx", "xx", "2009-08-14", 76, ["indie", "electronic", "chill"], ["atmospheric", "restrained", "cinematic"], [0.5, 0.55, 0.3, 105], ["anticipation", "space", "night"], "Two minutes of reverb and restraint that soundtracked a decade of montages."),
  t("Nuvole Bianche", "Ludovico Einaudi", "Una Mattina", "2004-01-01", 75, ["classical", "neoclassical", "piano"], ["melancholy", "calm", "cinematic"], [0.15, 0.3, 0.2, 68], ["reflection", "weather", "solitude"], "Repeating piano figures that work equally well for grief and for studying."),
  t("Sunset Lover", "Petit Biscuit", "Petit Biscuit", "2015-09-25", 73, ["electronic", "chillwave", "downtempo"], ["dreamy", "warm", "mellow"], [0.4, 0.62, 0.45, 105], ["sunsets", "drifting", "calm"], "Sunlit downtempo electronics with a plucked, tidal main line."),

  // --- Sad -----------------------------------------------------------------
  t("Someone Like You", "Adele", "21", "2011-01-24", 85, ["pop", "soul", "piano pop"], ["heartbroken", "restrained", "devastating"], [0.35, 0.44, 0.29, 135], ["heartbreak", "acceptance", "memory"], "One voice, one piano, and no place to hide."),
  t("Fix You", "Coldplay", "X&Y", "2005-09-05", 82, ["rock", "alternative rock", "pop rock"], ["mournful", "hopeful", "building"], [0.42, 0.21, 0.13, 138], ["grief", "comfort", "guidance"], "An organ-led lament that opens into one of rock's most-used catharses."),
  t("Skinny Love", "Bon Iver", "For Emma, Forever Ago", "2007-07-08", 76, ["indie folk", "folk"], ["raw", "aching", "spare"], [0.35, 0.44, 0.2, 152], ["collapse", "endurance", "winter"], "A cabin-recorded folk song about a love too thin to survive."),
  t("Nothing Compares 2 U", "Sinéad O'Connor", "I Do Not Want What I Haven't Got", "1990-01-08", 78, ["pop", "alternative", "soul"], ["desolate", "raw", "tender"], [0.3, 0.5, 0.2, 120], ["loss", "absence", "grief"], "A Prince song reinterpreted as a face-to-camera confession."),

  // --- Romantic ------------------------------------------------------------
  t("At Last", "Etta James", "At Last!", "1960-11-15", 76, ["soul", "jazz", "blues"], ["romantic", "lush", "warm"], [0.25, 0.35, 0.4, 88], ["arrival", "love", "relief"], "Strings, brass, and a voice that makes waiting sound worth it."),
  t("All of Me", "John Legend", "Love in the Future", "2013-08-12", 84, ["r&b", "pop", "soul"], ["romantic", "tender", "devoted"], [0.26, 0.42, 0.33, 120], ["devotion", "imperfection", "marriage"], "A piano-and-voice vow that took over every first dance for a decade."),

  // --- Workout -------------------------------------------------------------
  t("Till I Collapse", "Eminem", "The Eminem Show", "2002-05-26", 83, ["hip-hop", "rap"], ["relentless", "aggressive", "motivating"], [0.85, 0.55, 0.4, 171], ["endurance", "willpower", "defiance"], "The default gym anthem: marching drums and refusal to stop."),
  t("Stronger", "Kanye West", "Graduation", "2007-07-31", 82, ["hip-hop", "electronic rap"], ["driving", "confident", "electric"], [0.8, 0.62, 0.5, 104], ["persistence", "ambition", "nightlife"], "A Daft Punk sample turned into a treadmill-ready mantra."),
  t("Can't Hold Us", "Macklemore & Ryan Lewis", "The Heist", "2012-08-14", 80, ["hip-hop", "pop rap"], ["triumphant", "frantic", "celebratory"], [0.92, 0.64, 0.85, 146], ["momentum", "victory", "hustle"], "Piano stabs and double-time verses at a permanent sprint."),

  // --- Party ---------------------------------------------------------------
  t("Yeah!", "Usher", "Confessions", "2004-01-27", 82, ["r&b", "crunk", "pop"], ["party", "energetic", "flirtatious"], [0.85, 0.89, 0.72, 105], ["clubs", "flirting", "night"], "Crunk&B that has never once failed to fill a floor."),
  t("Uptown Funk", "Mark Ronson", "Uptown Special", "2014-11-10", 87, ["funk", "pop", "soul"], ["joyful", "swaggering", "energetic"], [0.61, 0.86, 0.93, 115], ["style", "celebration", "confidence"], "Minneapolis funk revival with horns and unlimited swagger."),
  t("I Gotta Feeling", "The Black Eyed Peas", "The E.N.D.", "2009-05-21", 79, ["dance pop", "electropop", "pop"], ["euphoric", "celebratory", "bright"], [0.78, 0.7, 0.72, 128], ["nights out", "optimism", "friends"], "The last-song-of-the-night template, four-on-the-floor and grinning."),
];

export const SEED_TRACK_COUNT = SEED_TRACKS.length;
