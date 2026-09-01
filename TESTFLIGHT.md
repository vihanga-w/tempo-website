# What to Test

Notes handed to TestFlight testers alongside each build. Paste the current
section into App Store Connect's "What to Test" field; it has a 4000 character
limit, so keep it inside that.

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
