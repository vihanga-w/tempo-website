# What to Test

Notes handed to TestFlight testers alongside each build. Paste the current
section into App Store Connect's "What to Test" field; it has a 4000 character
limit, so keep it inside that.

## 1.4.0 (build 13)

**Playlists are new — a tab of its own, and New Playlist in the menu.** Tempo
makes a playlist from things Spotify can't see: the songs you liked in
Discover, what your friends kept playing this week, the songs you keep coming
back to, or all of those weighed together. Every song says why it's
there — "Maya had this on repeat", "you liked this in Discover".

Please try:

• **Make one of each.** Open New Playlist, pick a recipe, and look at what it
shows before you name it. That preview is exactly what gets kept. If a recipe
says nothing fits yet, that's honest — it needs some listening or some swipes
in Discover first — but tell us if you're sure it should have found something.

• **Read the reason under each song.** This is the big one. If it names a
friend who didn't play it, a like you didn't give, or a time that's wrong, say
which song and we can trace it.

• **Take a song out, then refresh the playlist.** The song should stay out,
however many times you refresh. Refresh should also pick up anything new since.
Every playlist is also refreshed by itself once a week, and its Spotify copy
with it; the line at the bottom of a playlist says when.

• **Send one to Spotify.** It arrives as a private playlist on your account.
If you get a message saying Tempo needs one more permission, that's expected
for anyone who signed in before this build: sign in again when it asks and
try once more. Update on Spotify should bring the copy up to date after a
refresh or a removal.

• **Delete one.** It asks first. Deleting leaves the Spotify copy alone.

Also in this build:

• **Discover picks up where you left off.** Coming back to Discover, the cards
you'd already dealt with are skipped. Reaching the end now says you're caught
up and offers to show them again. Tell us if it skips cards you never saw, or
shows you cards you'd already swiped.

• **The menu reopens cleanly.** Closing the menu and opening it again straight
away used to leave the labels smeared. Open and close it a few times fast; the
labels should always arrive sharp, with the wave up the stack each time.

Known and not worth reporting: the preview line under a song in Discover
can't be dragged to scrub; that's by design for now.

## 1.2.0 (build 3)

**Passport is new — a tab of its own.** It works out where your music comes
from and gives you a stamp for each country you've spent real time in.

A country gets stamped once you've played three of its artists, or one of them
on three separate days, inside the last 30 days. So there are two ways in:
spread out across a country's music, or stay with one artist a while.

Please try:

• **Open Passport and let it sit for a minute.** Working out where an artist is
from takes a lookup per artist, and on a first open there may be a lot of them.
It fills in as it goes rather than all at once. If it still says Tempo is
working out where your music comes from after a few minutes, tell us.

• **Check your stamps against what you actually listen to.** This is the big
one. If a country is missing, wrong, or you can't see why you got it, that's
worth reporting — say which artist and which country, and we can trace it.

• **Look at Stopovers.** Countries you nearly stamped, and what you'd need to
get there. A country should never be in both Stopovers and your stamps, and
never in both Stopovers and Next Destination.

• **Read the Next Destination card.** The reasoning is written fresh for you.
Tell us if it says anything untrue, names an artist you've never played, or
just reads oddly.

• **Watch the globe.** It runs its own tour: it turns to one of your stamps,
holds it a couple of seconds, then moves on to the next. Each one should come
to rest somewhere you can actually see it rather than round the edge, and the
turn should be smooth. On an older device especially, tell us if it stutters or
if the phone gets warm. It isn't something you can drag — that's not a bug.

• **Scroll to the very bottom.** Nothing should end up stranded behind the
globe where you can't read or tap it.

• **Wait for a stamp to land.** You'll get a notification the first time you
stamp a country. Getting one for a country you've already stamped, or getting
the same one twice, is a bug — after the first, we only tell you at every
tenth. Screenshot it if it happens.

Also in this build: profile pictures now fade in from a blurred version of
themselves rather than appearing out of an empty circle. It should look like
the picture arriving, not like a grey box swapping out. Anywhere it flashes,
stays blurred, or shows the wrong picture's colours, we'd like to know.

Known and not worth reporting: artists whose country we can't determine are
left out rather than guessed at, so a very new or very obscure artist may not
count towards anything yet.
