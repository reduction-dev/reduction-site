---
slug: this-meeting-could-have-been-a-synaptic-transmission
---
# This Meeting Could Have Been a Synaptic Transmission

![header](./intro-header.jpg)

## What's Possible vs What We Get

Early in my career, I helped a friend install Wordpress right after his company
spent $300,000 on a failed software project to build a "content library". This
Wordpress instance became their content library and I got a $10,000 contract to
build a prototype of a collaborative voting system. I had to call it a prototype
because the owners didn't believe a single developer could build real software
in a few weeks. They used it until their acquisition 9 years later.

<!-- truncate -->

Ever since, I've been obsessed with the gap between what is _technically
possible_ to build and what _is_ built. The frontiers of technology keep
accelerating while the ability to use technology lags for most businesses.

## Small Teams, Big Impact

To understand why I wanted to build Reduction, you should know that **I'm all in
on small, skilled engineering teams**. I remember hearing John Siracusa express
this power of small teams on the Accidental Tech Podcast:

> Small groups of focused, really smart people can do great things in short
periods of time—things that larger groups of less motivated, less experienced,
less talented people can never do. It's not like, ok it takes these 5 people in
room a year to do this but if I have 300 people and 3 years, I could equal them.
No, will never equal them with 300 people if you don't have the right five.

These teams defy commonly understood trade-offs like "fast, good, or cheap: pick
two." They tend to say yes instead of litigating what the original requirements
said.

## The Threat of Process

It's hard to keep small teams working well as organizations grow. One reason
that Jeff Bezos identified is the pull toward "managing to proxies":

> ...if you're not watchful, the process can become the thing... You stop looking at outcomes and just make sure you're doing the process right. Gulp.

Shopify founder Tobi Lutke recently expressed a similar concern:

> A lot of what happens in companies is that policies and processes—they're well-meaning—they bring up the floor so no one actually does something really, really wrong. But what people don't see is, they also bring down the ceiling.

For small teams to have a shot, they need to defend themselves from coordination
overhead and misaligned incentives. Product teams can minimize process by owning
more of their technical stack and avoiding dependencies on technology-centered
teams that are disconnected from customer feedback loops.

## Breaking Down Technology Barriers

Some estimation heuristics: Whenever two engineering teams need to coordinate on
something, add a month. When there's ongoing coordination needed between
disciplines, take whatever sounds reasonable and double it. When a product needs
coordination from multiple orgs... that will just get done when it gets done.

Some handoffs are essential (between two business units focused on different
customer problems), some are nearly unavoidable (design, engineering,
marketing), but some are accidents of technology (front-end, backend, infra,
data).

By owning more, I've seen teams increase their agency:

- Front end, backend teams → Full stack teams
- QA testing team, coordinated release → Teams responsible for testing and release
- Data analysts own team metrics → Teams manage their metrics
- Operations team owns infrastructure → "You build it, you run it"

How can teams take on _more_ responsibilities and still do better than several
specialized teams? For one, the coordination overhead goes to near zero.
Meetings become 5 minute discussions across a desk, Slack messages become
thoughts. 

And good engineering teams love to automating things:

- QA click testing → Automated test suites
- Using GUI interfaces in the AWS Console → Infrastructure as Code
- Written specifications for cross team APIs → Protocol definition languages
like Protocol Buffers

With instant feedback on every editor keystroke and reproducible builds in the Cloud,
engineering workflows have become undeniably good. AI coding agents only
accelerate the pull of processes into these workflows.

## The Data Silo

While engineering teams can own their infrastructure, UI, and backend code, data
engineering remains stubbornly siloed. If AI coding agents live up to their
promises, we're likely to see smaller teams own larger software projects and all
the resulting data challenges associated with that:

- More users means more spammers and you need to separate bad actors from
legitimate ones
- You've got a lot of valuable data but efficiently providing recommendations or
audience engagement metrics requires new tools
- When moneys is flowing through your software you need to shut down fraud fast

Traditionally, the answer has been more specialists: Data Analysts, Data
Engineers, Data Scientists. But the principles of the data tooling pioneered at
large companies with teams of PhDs on staff are becoming well-understood.

## Reduction

Enter Reduction. Reduction is built for small, skilled teams that won't accept
artificial boundaries between technologies. It eliminates handoffs by bringing
data engineering into the familiar territory of software development.

Reduction is optimized for experienced, unspecialized teams who want to own both
their services and data pipelines. These teams can leverage their existing
skills with general-purpose programming languages instead of adopting
specialized DSLs or GUI tools. They can operate a Reduction job just like they'd
operate any other service in their ecosystem.

Reduction lets more small teams say "yes" when faced with data engineering
challenges.
