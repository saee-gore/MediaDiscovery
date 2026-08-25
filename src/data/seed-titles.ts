/**
 * Offline movie & series catalogue.
 *
 * Mirrors src/data/seed-tracks.ts: used when TMDB_API_KEY is absent so the
 * platform is fully explorable before anyone registers for an API key. The
 * narrative descriptors (mood, tone, pacing, emotional intensity, themes) are
 * editorial and exist to give the embedding model something meaningful to work
 * with — TMDB does not publish them. Live TMDB data supersedes ratings,
 * runtimes, posters and overviews once a key is configured; the descriptors
 * here are then re-derived by the enrichment step.
 */

export interface SeedTitle {
  slug: string;
  kind: "MOVIE" | "SERIES";
  title: string;
  released: string;
  releaseYear: number;
  /** Minutes. For series this is the typical episode length. */
  runtimeMin: number;
  seasons?: number;
  episodes?: number;
  /** 0–10, TMDB scale. */
  rating: number;
  /** 0–100. */
  popularity: number;
  language: string;
  genres: string[];
  moods: string[];
  themes: string[];
  tone: "light" | "balanced" | "serious" | "dark";
  pacing: "slow" | "moderate" | "brisk" | "relentless";
  intensity: "gentle" | "mild" | "medium" | "high" | "extreme";
  familyFriendly: boolean;
  tagline: string;
  description: string;
}

type Meta = {
  tone: SeedTitle["tone"];
  pacing: SeedTitle["pacing"];
  intensity: SeedTitle["intensity"];
  family?: boolean;
  language?: string;
};

function slugFor(title: string, year: number) {
  return `${title}-${year}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function film(
  title: string,
  released: string,
  runtimeMin: number,
  rating: number,
  popularity: number,
  genres: string[],
  moods: string[],
  themes: string[],
  meta: Meta,
  tagline: string,
  description: string,
): SeedTitle {
  const releaseYear = Number(released.slice(0, 4));
  return {
    slug: slugFor(title, releaseYear),
    kind: "MOVIE",
    title,
    released,
    releaseYear,
    runtimeMin,
    rating,
    popularity,
    language: meta.language ?? "en",
    genres,
    moods,
    themes,
    tone: meta.tone,
    pacing: meta.pacing,
    intensity: meta.intensity,
    familyFriendly: meta.family ?? false,
    tagline,
    description,
  };
}

function show(
  title: string,
  released: string,
  seasons: number,
  episodes: number,
  runtimeMin: number,
  rating: number,
  popularity: number,
  genres: string[],
  moods: string[],
  themes: string[],
  meta: Meta,
  tagline: string,
  description: string,
): SeedTitle {
  const releaseYear = Number(released.slice(0, 4));
  return {
    slug: slugFor(title, releaseYear),
    kind: "SERIES",
    title,
    released,
    releaseYear,
    runtimeMin,
    seasons,
    episodes,
    rating,
    popularity,
    language: meta.language ?? "en",
    genres,
    moods,
    themes,
    tone: meta.tone,
    pacing: meta.pacing,
    intensity: meta.intensity,
    familyFriendly: meta.family ?? false,
    tagline,
    description,
  };
}

export const SEED_TITLES: SeedTitle[] = [
  // --- Science fiction -----------------------------------------------------
  film("Interstellar", "2014-11-05", 169, 8.4, 92, ["science fiction", "drama", "adventure"], ["emotional", "epic", "thought-provoking"], ["space exploration", "family", "time", "survival"], { tone: "serious", pacing: "moderate", intensity: "high" }, "Mankind was born on Earth. It was never meant to die here.", "A father leaves his children behind to search other galaxies for a habitable world, and pays for it in years he can never get back. Enormous in scale, but the engine of it is a parent and a daughter separated by relativity."),
  film("Arrival", "2016-11-11", 116, 7.9, 84, ["science fiction", "drama", "mystery"], ["contemplative", "melancholy", "thought-provoking"], ["language", "grief", "first contact", "time"], { tone: "serious", pacing: "slow", intensity: "medium" }, "Why are they here?", "A linguist is asked to work out how to talk to visitors whose language has no arrow of time. Quiet, patient first-contact science fiction that turns out to be about loss."),
  film("Blade Runner 2049", "2017-10-06", 164, 8.0, 80, ["science fiction", "mystery", "drama"], ["moody", "atmospheric", "melancholy"], ["identity", "memory", "humanity", "dystopia"], { tone: "dark", pacing: "slow", intensity: "medium" }, "There is an order to things.", "A replicant detective pulls a thread that unravels what separates manufactured life from the real thing. Visually monumental and deliberately unhurried."),
  film("Dune", "2021-10-22", 155, 7.8, 86, ["science fiction", "adventure", "drama"], ["epic", "ominous", "immersive"], ["destiny", "colonialism", "ecology", "power"], { tone: "serious", pacing: "moderate", intensity: "high" }, "Beyond fear, destiny awaits.", "A ducal heir is dropped into a desert planet's brutal politics. Enormous world-building, restrained action, and a constant sense of something enormous approaching."),
  film("Ex Machina", "2014-04-10", 108, 7.7, 74, ["science fiction", "thriller", "drama"], ["tense", "cerebral", "unsettling"], ["artificial intelligence", "manipulation", "consciousness"], { tone: "dark", pacing: "slow", intensity: "medium" }, "There is nothing more human than the will to survive.", "Three characters, one glass house, and a Turing test that turns into something else. Chamber-piece science fiction that thinks harder than it shouts."),
  film("Gattaca", "1997-10-24", 106, 7.6, 66, ["science fiction", "drama", "thriller"], ["restrained", "determined", "melancholy"], ["genetics", "class", "ambition", "identity"], { tone: "serious", pacing: "moderate", intensity: "mild" }, "There is no gene for the human spirit.", "In a world sorted by DNA, an 'invalid' borrows another man's genome to reach space. Cool, elegant and almost entirely bloodless."),
  film("Contact", "1997-07-11", 150, 7.5, 63, ["science fiction", "drama", "mystery"], ["awed", "hopeful", "thoughtful"], ["first contact", "faith", "science", "grief"], { tone: "serious", pacing: "slow", intensity: "mild" }, "A message from deep space.", "A radio astronomer receives a signal and spends the rest of the film arguing about what belief means. Wonder-driven rather than action-driven."),
  film("The Martian", "2015-10-02", 144, 7.7, 79, ["science fiction", "adventure", "drama"], ["optimistic", "witty", "resourceful"], ["survival", "problem solving", "space exploration"], { tone: "balanced", pacing: "brisk", intensity: "mild", family: true }, "Bring him home.", "An astronaut left for dead on Mars solves one problem at a time with duct tape and potatoes. Unusually cheerful for a survival story."),
  film("Children of Men", "2006-09-22", 109, 7.9, 71, ["science fiction", "thriller", "drama"], ["bleak", "urgent", "harrowing"], ["dystopia", "hope", "refugees", "fertility"], { tone: "dark", pacing: "brisk", intensity: "high" }, "No child has been born for 18 years.", "In a childless world, a burnt-out bureaucrat escorts the only pregnant woman alive through a collapsing Britain. Famous for its long unbroken takes."),
  film("Everything Everywhere All at Once", "2022-03-25", 139, 7.8, 85, ["science fiction", "comedy", "drama", "action"], ["chaotic", "emotional", "absurd"], ["family", "regret", "multiverse", "nihilism"], { tone: "balanced", pacing: "relentless", intensity: "high" }, "The universe is so much bigger than you realise.", "A laundromat owner in the middle of a tax audit learns to borrow skills from her other lives. Maximalist and exhausting on purpose, and ultimately about a mother and daughter."),
  film("Inception", "2010-07-16", 148, 8.4, 88, ["science fiction", "action", "thriller"], ["cerebral", "propulsive", "cool"], ["dreams", "grief", "guilt", "heists"], { tone: "serious", pacing: "brisk", intensity: "high" }, "Your mind is the scene of the crime.", "A team of thieves plants an idea inside a target's dream. Architecturally complicated, emotionally simple."),
  film("The Prestige", "2006-10-20", 130, 8.2, 74, ["drama", "mystery", "science fiction", "thriller"], ["obsessive", "cold", "twisty"], ["rivalry", "obsession", "sacrifice", "illusion"], { tone: "dark", pacing: "moderate", intensity: "medium" }, "Are you watching closely?", "Two Victorian magicians destroy themselves trying to out-trick each other. A film about the cost of a secret."),

  // --- Mystery / thriller / crime ------------------------------------------
  film("Parasite", "2019-05-30", 132, 8.5, 88, ["thriller", "drama", "comedy"], ["tense", "darkly funny", "shocking"], ["class", "family", "deception", "inequality"], { tone: "dark", pacing: "brisk", intensity: "high", language: "ko" }, "Act like you own the place.", "A poor family talents its way into a rich household, one job at a time, until the basement gives up its secret. Tonally slippery and impossible to predict."),
  film("Get Out", "2017-02-24", 104, 7.7, 80, ["horror", "thriller", "mystery"], ["unsettling", "sharp", "paranoid"], ["race", "control", "gaslighting"], { tone: "dark", pacing: "moderate", intensity: "high" }, "Just because you're invited doesn't mean you're welcome.", "A weekend meeting the girlfriend's parents curdles into something much worse. Social satire built into the horror mechanics."),
  film("Knives Out", "2019-09-07", 130, 7.9, 82, ["mystery", "comedy", "crime"], ["playful", "clever", "warm"], ["family", "wealth", "inheritance", "class"], { tone: "light", pacing: "brisk", intensity: "mild" }, "Hell, any of them could have done it.", "A wealthy novelist dies the night of his birthday party, and a drawling private detective works the room. A whodunnit with genuine jokes."),
  film("Prisoners", "2013-09-20", 153, 8.1, 72, ["thriller", "crime", "drama", "mystery"], ["grim", "tense", "harrowing"], ["revenge", "faith", "desperation", "moral compromise"], { tone: "dark", pacing: "slow", intensity: "extreme" }, "Every moment matters.", "Two girls vanish, and a father decides the police are moving too slowly. Long, heavy and genuinely upsetting."),
  film("Gone Girl", "2014-10-01", 149, 8.0, 78, ["thriller", "mystery", "drama"], ["cold", "twisty", "sardonic"], ["marriage", "media", "deception", "control"], { tone: "dark", pacing: "moderate", intensity: "high" }, "You don't know what you've got 'til it's gone.", "A wife disappears and her husband becomes the story. A vicious satire of marriage dressed as a missing-person thriller."),
  film("Zodiac", "2007-03-02", 157, 7.7, 70, ["crime", "drama", "mystery", "thriller"], ["obsessive", "procedural", "unresolved"], ["obsession", "journalism", "unsolved crime"], { tone: "dark", pacing: "slow", intensity: "medium" }, "There's more than one way to lose your life to a killer.", "Decades of investigation into a killer nobody catches. A procedural about the damage of not knowing."),
  film("No Country for Old Men", "2007-05-19", 122, 8.2, 76, ["crime", "thriller", "drama"], ["stark", "menacing", "spare"], ["fate", "violence", "ageing", "greed"], { tone: "dark", pacing: "moderate", intensity: "high" }, "There are no clean getaways.", "A hunter takes a case of drug money and is pursued by something closer to weather than a man. Almost no score, almost no mercy."),
  film("Sicario", "2015-09-18", 121, 7.6, 71, ["thriller", "crime", "action"], ["tense", "grim", "disorienting"], ["cartels", "moral compromise", "borders"], { tone: "dark", pacing: "moderate", intensity: "high" }, "The border is just another line to cross.", "An idealistic FBI agent is attached to a task force that will not explain its rules. Sustained dread rather than action."),
  film("Heat", "1995-12-15", 170, 8.3, 74, ["crime", "drama", "thriller", "action"], ["cool", "epic", "melancholy"], ["obsession", "professionalism", "loneliness"], { tone: "serious", pacing: "moderate", intensity: "high" }, "A Los Angeles crime saga.", "A detective and a career thief circle each other across a huge, lonely Los Angeles. The bank heist is still the standard."),
  film("Drive", "2011-05-20", 100, 7.8, 70, ["crime", "thriller", "drama"], ["stylish", "quiet", "brutal"], ["loneliness", "protection", "violence"], { tone: "dark", pacing: "slow", intensity: "high" }, "There are no clean getaways.", "A stunt driver moonlights as a getaway man and says almost nothing. Neon, synths, and sudden violence."),
  film("Nope", "2022-07-22", 130, 6.9, 72, ["horror", "science fiction", "mystery"], ["eerie", "awed", "wry"], ["spectacle", "exploitation", "siblings"], { tone: "dark", pacing: "moderate", intensity: "high" }, "What's a bad miracle?", "Ranch siblings try to film the thing in the sky above their property. A horror film about the urge to look."),
  film("Hereditary", "2018-06-08", 127, 7.3, 68, ["horror", "drama", "mystery"], ["dreadful", "grief-stricken", "harrowing"], ["grief", "family", "inheritance", "the occult"], { tone: "dark", pacing: "slow", intensity: "extreme" }, "Every family tree hides a secret.", "A family unravels after a death, in ways that turn out to have been arranged. Genuinely distressing, not a casual watch."),

  // --- Drama ---------------------------------------------------------------
  film("Whiplash", "2014-10-10", 106, 8.4, 79, ["drama", "music"], ["intense", "relentless", "abrasive"], ["ambition", "abuse", "mastery", "obsession"], { tone: "dark", pacing: "relentless", intensity: "high" }, "The road to greatness can take you to the edge.", "A jazz student and a conductor who believes cruelty makes genius. Cut like a thriller, and just as tense."),
  film("Moonlight", "2016-10-21", 111, 7.4, 68, ["drama"], ["tender", "melancholy", "intimate"], ["identity", "masculinity", "queer love", "growing up"], { tone: "serious", pacing: "slow", intensity: "medium" }, "This is the story of a lifetime.", "Three chapters in one man's life, each played by a different actor. Quiet, precise, and enormously moving."),
  film("Past Lives", "2023-06-02", 105, 7.9, 70, ["drama", "romance"], ["wistful", "gentle", "aching"], ["fate", "immigration", "what-ifs", "friendship"], { tone: "serious", pacing: "slow", intensity: "mild" }, "Twenty years, two continents, one question.", "Two childhood friends meet again in New York after decades apart. Almost nothing happens, and it breaks your heart."),
  film("Eternal Sunshine of the Spotless Mind", "2004-03-19", 108, 8.1, 76, ["drama", "romance", "science fiction"], ["bittersweet", "inventive", "melancholy"], ["memory", "heartbreak", "second chances"], { tone: "balanced", pacing: "moderate", intensity: "medium" }, "You can erase someone from your mind. Getting them out of your heart is another story.", "A couple pay to have each other deleted, and the memories fight back. Structurally playful, emotionally direct."),
  film("Her", "2013-12-18", 126, 7.9, 72, ["drama", "romance", "science fiction"], ["tender", "lonely", "warm"], ["loneliness", "artificial intelligence", "intimacy"], { tone: "serious", pacing: "slow", intensity: "mild" }, "A story about someone who falls in love with something.", "A lonely letter-writer falls for his operating system. Soft pastels, soft heartbreak."),
  film("La La Land", "2016-12-09", 128, 7.5, 78, ["musical", "romance", "drama"], ["dreamy", "bittersweet", "vibrant"], ["ambition", "compromise", "love", "art"], { tone: "balanced", pacing: "moderate", intensity: "mild" }, "Here's to the fools who dream.", "A jazz pianist and an actress fall for each other and for their careers. The last ten minutes are the whole point."),
  film("Portrait of a Lady on Fire", "2019-09-18", 122, 8.1, 62, ["drama", "romance", "history"], ["restrained", "yearning", "painterly"], ["queer love", "art", "memory", "class"], { tone: "serious", pacing: "slow", intensity: "mild", language: "fr" }, "Do all lovers feel they're inventing something?", "A painter is hired to portray a reluctant bride without her knowing. Almost no music, and every glance load-bearing."),
  film("In the Mood for Love", "2000-09-29", 98, 8.1, 60, ["drama", "romance"], ["longing", "elegant", "restrained"], ["infidelity", "restraint", "loneliness", "memory"], { tone: "serious", pacing: "slow", intensity: "mild", language: "zh" }, "Feel the heat, keep the feeling burning.", "Two neighbours realise their spouses are having an affair, and refuse to become one themselves. All colour, corridors and withheld touch."),
  film("Roma", "2018-08-30", 135, 7.7, 58, ["drama"], ["observational", "tender", "melancholy"], ["class", "motherhood", "memory", "mexico city"], { tone: "serious", pacing: "slow", intensity: "medium", language: "es" }, "A year in the life of a family.", "A domestic worker for a middle-class Mexico City household in the early seventies. Black and white, autobiographical, quietly devastating."),
  film("CODA", "2021-08-13", 111, 8.0, 70, ["drama", "music", "comedy"], ["warm", "uplifting", "emotional"], ["family", "deafness", "ambition", "leaving home"], { tone: "balanced", pacing: "moderate", intensity: "mild", family: true }, "Find your voice.", "The only hearing member of a deaf fishing family wants to study music. Sentimental in the way that works."),

  // --- Comfort, comedy, family --------------------------------------------
  film("The Grand Budapest Hotel", "2014-02-26", 99, 8.1, 78, ["comedy", "drama", "adventure"], ["whimsical", "witty", "melancholy"], ["friendship", "nostalgia", "europe", "loyalty"], { tone: "light", pacing: "brisk", intensity: "gentle" }, "A perfect holiday, off the beaten path.", "A concierge and his lobby boy across a fictional Europe sliding into war. Immaculately symmetrical and secretly sad."),
  film("Paddington 2", "2017-11-10", 103, 7.8, 76, ["comedy", "family", "adventure"], ["warm", "gentle", "delightful"], ["kindness", "found family", "prison", "london"], { tone: "light", pacing: "brisk", intensity: "gentle", family: true }, "A bear on a mission.", "A polite bear takes a job to buy a birthday present and ends up reforming a prison. Aggressively kind-hearted and genuinely funny."),
  film("The Princess Bride", "1987-09-25", 98, 8.0, 72, ["adventure", "comedy", "romance", "fantasy"], ["playful", "charming", "quotable"], ["true love", "revenge", "storytelling"], { tone: "light", pacing: "brisk", intensity: "gentle", family: true }, "Nothing but the truth. Well, mostly.", "A grandfather reads a fairy tale about pirates, giants and revenge. Endlessly rewatchable."),
  film("Chef", "2014-05-09", 114, 7.3, 64, ["comedy", "drama"], ["warm", "feel-good", "appetising"], ["reinvention", "fatherhood", "food", "road trip"], { tone: "light", pacing: "moderate", intensity: "gentle", family: true }, "Starting from scratch never tasted so good.", "A chef quits, buys a food truck and drives across America with his son. Low stakes on purpose; do not watch hungry."),
  film("Little Miss Sunshine", "2006-07-26", 101, 7.8, 68, ["comedy", "drama", "family"], ["bittersweet", "wry", "warm"], ["family", "failure", "road trip", "acceptance"], { tone: "balanced", pacing: "moderate", intensity: "mild" }, "A family on the verge of a breakdown.", "A dysfunctional family drives a failing van to a children's beauty pageant. Funny about despair."),
  film("Booksmart", "2019-05-24", 102, 7.1, 62, ["comedy"], ["energetic", "warm", "irreverent"], ["friendship", "graduation", "youth"], { tone: "light", pacing: "brisk", intensity: "mild" }, "Getting straight A's. Giving zero F's.", "Two overachievers try to cram four years of partying into one night. Sharp, kind and very fast."),
  film("Superbad", "2007-08-17", 113, 7.6, 70, ["comedy"], ["raucous", "awkward", "affectionate"], ["friendship", "adolescence", "growing apart"], { tone: "light", pacing: "brisk", intensity: "mild" }, "Come and get some.", "Two friends attempt to buy alcohol for a party on the last night of high school. Cruder than it is cynical."),
  film("Spirited Away", "2001-07-20", 125, 8.5, 84, ["animation", "fantasy", "adventure"], ["magical", "eerie", "wondrous"], ["growing up", "greed", "identity", "work"], { tone: "balanced", pacing: "moderate", intensity: "mild", family: true, language: "ja" }, "The tunnel led Chihiro to a mysterious town.", "A sulky ten-year-old must work in a bathhouse for spirits to save her parents. Strange, beautiful, and never explains itself."),
  film("My Neighbor Totoro", "1988-04-16", 86, 8.1, 74, ["animation", "family", "fantasy"], ["gentle", "warm", "wondrous"], ["childhood", "illness", "nature", "sisters"], { tone: "light", pacing: "slow", intensity: "gentle", family: true, language: "ja" }, "A gentle giant in the forest.", "Two sisters befriend a forest spirit while their mother is in hospital. Almost plotless, entirely comforting."),
  film("Spider-Man: Into the Spider-Verse", "2018-12-06", 117, 8.4, 86, ["animation", "action", "adventure"], ["kinetic", "funny", "heartfelt"], ["identity", "mentorship", "multiverse", "grief"], { tone: "balanced", pacing: "relentless", intensity: "mild", family: true }, "More than one wears the mask.", "A Brooklyn teenager gets bitten, then meets five other Spider-People. Visually unlike anything before it."),
  film("Coco", "2017-10-20", 105, 8.2, 82, ["animation", "family", "adventure"], ["colourful", "emotional", "warm"], ["family", "memory", "music", "death"], { tone: "balanced", pacing: "brisk", intensity: "mild", family: true }, "The celebration of a lifetime.", "A boy who wants to play music crosses into the Land of the Dead. Prepare for the last fifteen minutes."),
  film("Inside Out", "2015-06-19", 95, 8.0, 80, ["animation", "family", "comedy", "drama"], ["clever", "emotional", "warm"], ["emotions", "growing up", "sadness", "moving house"], { tone: "balanced", pacing: "brisk", intensity: "mild", family: true }, "Meet the little voices inside your head.", "Five emotions run a eleven-year-old's head as her family moves cities. Makes a real argument for sadness."),
  film("Amélie", "2001-04-25", 122, 7.9, 70, ["comedy", "romance"], ["whimsical", "warm", "charming"], ["kindness", "loneliness", "paris", "small gestures"], { tone: "light", pacing: "brisk", intensity: "gentle", language: "fr" }, "She'll change your life.", "A shy Parisian waitress arranges small secret good deeds for everyone but herself. Saturated greens and reds, and a lot of charm."),
  film("Before Sunrise", "1995-01-27", 101, 8.1, 66, ["romance", "drama"], ["talkative", "romantic", "wistful"], ["chance encounters", "conversation", "vienna", "youth"], { tone: "light", pacing: "slow", intensity: "gentle" }, "Can the greatest romance of your life last only one night?", "Two strangers get off a train in Vienna and talk until morning. That's the whole film, and it's perfect."),

  // --- Action --------------------------------------------------------------
  film("Mad Max: Fury Road", "2015-05-15", 120, 8.1, 84, ["action", "adventure", "science fiction"], ["relentless", "kinetic", "vivid"], ["survival", "tyranny", "escape", "water"], { tone: "dark", pacing: "relentless", intensity: "high" }, "What a lovely day.", "One long chase across a desert, out and back. Practical stunts, minimal dialogue, maximum momentum."),
  film("John Wick", "2014-10-22", 101, 7.4, 78, ["action", "thriller", "crime"], ["stylish", "propulsive", "brutal"], ["revenge", "grief", "underworld"], { tone: "dark", pacing: "relentless", intensity: "high" }, "Don't set him off.", "A retired hitman comes back for his dog. Clean, legible, extremely violent action choreography."),

  // --- Series: prestige drama ---------------------------------------------
  show("Breaking Bad", "2008-01-20", 5, 62, 47, 8.9, 90, ["crime", "drama", "thriller"], ["tense", "morally grim", "addictive"], ["transformation", "pride", "family", "consequences"], { tone: "dark", pacing: "moderate", intensity: "high" }, "All hail the king.", "A chemistry teacher with cancer starts cooking methamphetamine and finds he's good at it. The most complete character collapse on television."),
  show("Better Call Saul", "2015-02-08", 6, 63, 47, 8.8, 82, ["crime", "drama"], ["melancholy", "wry", "slow-burning"], ["self-sabotage", "brothers", "law", "identity"], { tone: "dark", pacing: "slow", intensity: "medium" }, "The customer is always right.", "How a decent-ish lawyer becomes a criminal one. More patient and arguably sadder than its parent show."),
  show("The Wire", "2002-06-02", 5, 60, 59, 8.9, 78, ["crime", "drama"], ["novelistic", "unsentimental", "sprawling"], ["institutions", "policing", "drugs", "city politics"], { tone: "dark", pacing: "slow", intensity: "medium" }, "Listen carefully.", "Baltimore, seen a whole institution at a time. Demands patience for a season and repays it for a decade."),
  show("Succession", "2018-06-03", 4, 39, 60, 8.9, 84, ["drama", "comedy"], ["vicious", "funny", "cold"], ["family", "power", "media", "inheritance"], { tone: "dark", pacing: "brisk", intensity: "medium" }, "You can't make a Tomelette without breaking some Greggs.", "A media dynasty's children compete for a throne their father won't leave. Savage dialogue, no heroes."),
  show("Severance", "2022-02-18", 2, 19, 50, 8.7, 86, ["science fiction", "thriller", "drama", "mystery"], ["eerie", "clinical", "unsettling"], ["work-life balance", "identity", "corporate control", "grief"], { tone: "dark", pacing: "slow", intensity: "medium" }, "Please enjoy each memory equally.", "Employees surgically split their memories between work and home. Immaculately designed, deeply strange office horror."),
  show("Chernobyl", "2019-05-06", 1, 5, 65, 9.0, 80, ["drama", "history", "thriller"], ["grim", "harrowing", "meticulous"], ["disaster", "lies", "bureaucracy", "sacrifice"], { tone: "dark", pacing: "moderate", intensity: "extreme" }, "What is the cost of lies?", "The 1986 reactor failure and the months after. Five episodes, no filler, difficult to watch and impossible to stop."),
  show("Mindhunter", "2017-10-13", 2, 19, 55, 8.6, 74, ["crime", "drama", "thriller"], ["procedural", "clinical", "unsettling"], ["psychology", "serial crime", "obsession", "the fbi"], { tone: "dark", pacing: "slow", intensity: "high" }, "How do we get ahead of crazy?", "Two FBI agents in the late seventies invent criminal profiling by interviewing killers. Talk-heavy and quietly disturbing."),
  show("True Detective", "2014-01-12", 4, 30, 55, 8.6, 78, ["crime", "drama", "mystery"], ["brooding", "atmospheric", "philosophical"], ["obsession", "corruption", "partnership", "the south"], { tone: "dark", pacing: "slow", intensity: "high" }, "Time is a flat circle.", "An anthology of detective partnerships and long-buried crimes. The first season is the one people mean."),
  show("Broadchurch", "2013-03-04", 3, 24, 48, 8.4, 70, ["crime", "drama", "mystery"], ["sombre", "empathetic", "tense"], ["grief", "small towns", "suspicion", "media"], { tone: "serious", pacing: "moderate", intensity: "medium" }, "A town wrapped in secrets.", "A boy's death turns a Dorset seaside town inside out. As interested in the grieving family as the investigation."),
  show("The Night Of", "2016-07-10", 1, 8, 60, 8.5, 66, ["crime", "drama", "mystery"], ["grim", "procedural", "claustrophobic"], ["justice system", "prison", "doubt", "race"], { tone: "dark", pacing: "slow", intensity: "high" }, "The system is the story.", "A student wakes beside a body with no memory of the night. Eight episodes following what the system does to him."),
  show("The Fall", "2013-05-13", 3, 17, 58, 8.1, 62, ["crime", "thriller", "drama"], ["cold", "tense", "methodical"], ["predation", "policing", "gender", "belfast"], { tone: "dark", pacing: "slow", intensity: "high" }, "Two hunters. One city.", "A detective superintendent hunts a Belfast serial killer whose identity the audience knows from minute one."),
  show("Bodyguard", "2018-08-26", 1, 6, 58, 8.1, 68, ["thriller", "drama", "crime"], ["propulsive", "tense", "twisty"], ["ptsd", "politics", "terrorism", "trust"], { tone: "dark", pacing: "relentless", intensity: "high" }, "Trust no one.", "A veteran assigned to protect a home secretary he politically despises. Six episodes designed to be watched in two nights."),
  show("Sherlock", "2010-07-25", 4, 13, 88, 8.5, 76, ["crime", "drama", "mystery"], ["clever", "brisk", "stylised"], ["deduction", "friendship", "london"], { tone: "balanced", pacing: "brisk", intensity: "medium" }, "The game is on.", "Feature-length modern Holmes cases. Three episodes a season, each essentially a film."),
  show("The Queen's Gambit", "2020-10-23", 1, 7, 55, 8.5, 80, ["drama"], ["stylish", "absorbing", "tense"], ["genius", "addiction", "chess", "orphanhood"], { tone: "serious", pacing: "moderate", intensity: "medium" }, "Every move counts.", "An orphan becomes a chess prodigy while chemically holding herself together. A perfect one-weekend series."),
  show("Normal People", "2020-04-26", 1, 12, 30, 8.4, 72, ["drama", "romance"], ["intimate", "tender", "aching"], ["first love", "class", "mental health", "miscommunication"], { tone: "serious", pacing: "slow", intensity: "medium", language: "en" }, "It's not like this with other people.", "Two Irish teenagers keep finding and losing each other through university. Half-hour episodes, enormous emotional weight."),
  show("Andor", "2022-09-21", 2, 24, 45, 8.4, 78, ["science fiction", "drama", "thriller"], ["grounded", "tense", "political"], ["rebellion", "surveillance", "sacrifice", "empire"], { tone: "serious", pacing: "moderate", intensity: "medium" }, "The rebellion is built by people you never hear about.", "How ordinary people are radicalised into a resistance. Star Wars as a le Carré-style political drama."),
  show("The Expanse", "2015-12-14", 6, 62, 45, 8.5, 74, ["science fiction", "drama", "mystery"], ["gritty", "political", "immersive"], ["colonisation", "class", "first contact", "solar system politics"], { tone: "serious", pacing: "moderate", intensity: "medium" }, "The belt remembers.", "A hard-science solar system on the edge of war, plus something alien in the middle of it. Excellent world-building."),
  show("Dark", "2017-12-01", 3, 26, 55, 8.7, 76, ["science fiction", "mystery", "thriller", "drama"], ["bleak", "intricate", "unsettling"], ["time travel", "family", "fate", "small towns"], { tone: "dark", pacing: "moderate", intensity: "high", language: "de" }, "The question is not where, but when.", "A German town's missing children turn out to be a time-loop problem spanning four families. Take notes."),
  show("Black Mirror", "2011-12-04", 6, 27, 60, 8.7, 82, ["science fiction", "drama", "thriller"], ["cynical", "unsettling", "inventive"], ["technology", "society", "consequences", "isolation"], { tone: "dark", pacing: "moderate", intensity: "high" }, "The way we live now, only worse.", "Standalone episodes about technology going wrong in ways that feel about ten minutes away."),
  show("Stranger Things", "2016-07-15", 4, 34, 55, 8.6, 88, ["science fiction", "horror", "drama", "adventure"], ["nostalgic", "adventurous", "spooky"], ["friendship", "the eighties", "monsters", "small towns"], { tone: "balanced", pacing: "brisk", intensity: "medium" }, "One summer can change everything.", "Kids on bikes versus a parallel dimension in 1980s Indiana. Warm and scary in roughly equal measure."),
  show("Squid Game", "2021-09-17", 2, 16, 55, 8.0, 84, ["thriller", "drama", "action"], ["brutal", "tense", "satirical"], ["debt", "class", "desperation", "games"], { tone: "dark", pacing: "brisk", intensity: "extreme", language: "ko" }, "45.6 billion won is child's play.", "Indebted contestants play children's games for a fortune, and the losing is permanent. Very violent."),
  show("Arcane", "2021-11-06", 2, 18, 40, 9.0, 82, ["animation", "action", "drama", "fantasy"], ["gorgeous", "emotional", "kinetic"], ["sisters", "class", "revolution", "invention"], { tone: "serious", pacing: "brisk", intensity: "high" }, "Two sisters. Two cities. One war.", "A hand-painted animated series about two sisters on opposite sides of a class war. Stunning to look at, genuinely well written."),

  // --- Series: comfort & comedy -------------------------------------------
  show("The Bear", "2022-06-23", 3, 28, 32, 8.4, 82, ["drama", "comedy"], ["frantic", "intense", "warm"], ["grief", "family", "restaurants", "perfectionism"], { tone: "serious", pacing: "relentless", intensity: "high" }, "Every second counts.", "A fine-dining chef takes over his late brother's sandwich shop. Half-hour episodes that feel like panic attacks, then suddenly like grace."),
  show("Fleabag", "2016-07-21", 2, 12, 27, 8.7, 80, ["comedy", "drama"], ["sharp", "funny", "devastating"], ["grief", "guilt", "sisters", "faith"], { tone: "balanced", pacing: "brisk", intensity: "medium" }, "It's a love story, sort of.", "A woman narrates her own disaster directly to camera. Season two is one of the great short runs of television."),
  show("Ted Lasso", "2020-08-14", 3, 34, 33, 8.0, 80, ["comedy", "drama", "sport"], ["warm", "optimistic", "gentle"], ["kindness", "mental health", "football", "found family"], { tone: "light", pacing: "moderate", intensity: "gentle", family: true }, "Kindness makes a comeback.", "An American college football coach is hired to manage an English Premier League club. Determinedly good-hearted."),
  show("Schitt's Creek", "2015-01-13", 6, 80, 22, 8.5, 78, ["comedy"], ["warm", "silly", "affectionate"], ["family", "reinvention", "small towns", "queer love"], { tone: "light", pacing: "brisk", intensity: "gentle", family: true }, "Ew, David.", "A wealthy family loses everything and moves into a motel in a town they once bought as a joke. Gets kinder every season."),
  show("The Good Place", "2016-09-19", 4, 53, 22, 8.2, 76, ["comedy", "fantasy", "drama"], ["clever", "warm", "surprising"], ["ethics", "afterlife", "self-improvement", "friendship"], { tone: "light", pacing: "brisk", intensity: "gentle", family: true }, "Welcome. Everything is fine.", "A woman who does not deserve heaven ends up there and tries to earn it. A sitcom that is also a moral philosophy course."),
  show("Brooklyn Nine-Nine", "2013-09-17", 8, 153, 22, 8.4, 80, ["comedy", "crime"], ["silly", "warm", "quick"], ["workplace", "friendship", "policing"], { tone: "light", pacing: "brisk", intensity: "gentle", family: true }, "Nine-nine!", "A detective squad run as a joke-per-second ensemble comedy. Ideal background comfort watching."),
  show("Parks and Recreation", "2009-04-09", 7, 126, 22, 8.6, 78, ["comedy"], ["warm", "optimistic", "silly"], ["local government", "friendship", "ambition", "small towns"], { tone: "light", pacing: "brisk", intensity: "gentle", family: true }, "Never half-ass two things.", "A relentlessly enthusiastic parks official tries to build something good in a small Indiana town."),
  show("Derry Girls", "2018-01-04", 3, 19, 22, 8.5, 70, ["comedy"], ["riotous", "warm", "nostalgic"], ["adolescence", "the troubles", "friendship", "northern ireland"], { tone: "light", pacing: "brisk", intensity: "mild" }, "Grown-ups are the worst.", "Teenagers being ridiculous in 1990s Derry, with the Troubles as background noise. Very fast and very funny."),
  show("Only Murders in the Building", "2021-08-31", 4, 40, 32, 8.1, 78, ["comedy", "crime", "mystery"], ["cosy", "witty", "playful"], ["true crime", "friendship", "new york", "loneliness"], { tone: "light", pacing: "brisk", intensity: "gentle" }, "The building has secrets.", "Three true-crime podcast obsessives investigate a death in their apartment block. Comfort-mystery in half-hour doses."),
  show("The Great British Bake Off", "2010-08-17", 15, 140, 60, 8.5, 74, ["reality", "competition"], ["gentle", "cosy", "wholesome"], ["baking", "kindness", "competition", "britain"], { tone: "light", pacing: "slow", intensity: "gentle", family: true }, "On your marks, get set, bake.", "Amateur bakers compete in a tent and are unfailingly nice to each other. The definition of a low-stakes watch."),
  show("Planet Earth II", "2016-11-06", 1, 6, 50, 9.4, 76, ["documentary", "nature"], ["awed", "serene", "spectacular"], ["nature", "survival", "islands", "cities"], { tone: "balanced", pacing: "slow", intensity: "mild", family: true }, "A journey through the wild.", "Wildlife photography at a level that had not previously existed, narrated with great calm."),
];

export const SEED_TITLE_COUNT = SEED_TITLES.length;
