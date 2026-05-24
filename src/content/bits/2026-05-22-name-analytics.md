---
title: "New mini-app for name analytics: What's in a Name?"
date: "2026-05-22 09:00:00"
permalink: "/blog/2026/05/name-analytics/"
description: "A short announcement for the data/stats mini-app What's in a Name?, which shows whether a name is old, new, making a comeback, going out of style, and how popular it is."
tags: ["data", "projects"]
---

I just launched [What's in a Name?](/projects/name-analytics/), a small interactive tool for exploring U.S. baby-name data.

Type a first name, choose female or male, and it answers two plain-English questions:

1. Is this name mostly old, new, making a comeback, or going out of style?
2. How popular is it compared with other names in any given birth year?

Two handy use-cases. First, if you get an email, resume, or other note from someone, it can give you a sense of their likely age based on their first name. For example, [Harold](/projects/name-analytics/?name=Harold&sex=M) reads older and [Logan](/projects/name-analytics/?name=Logan&sex=M) reads younger. Second, if you're hunting for baby names, it helps separate names that are on the rise from names that are already hot, declining, or outdated. For example, [Wells](/projects/name-analytics/?name=Wells&sex=M) is on the rise; [Harvey](/projects/name-analytics/?name=Harvey&sex=M) is an old name making a comeback; [Aiden](/projects/name-analytics/?name=Aiden&sex=M) was hot but has peaked and is going out of style, much like [Cody](/projects/name-analytics/?name=Cody&sex=M) peaked in the early 90s.

The first answer comes from the birth-year distribution. If most people with the name were born decades ago, it reads as an older name. If the mass is recent, it reads as a newer name. If there is an older wave and a newer rise, the name is making a comeback. If a recent peak is fading, the name is going out of style.

The second answer comes from comparing the name with other names in each birth year, so "popular" means common among babies born then rather than merely common in the whole dataset.

It uses the Social Security baby names data, so it is about U.S. births. It is not adjusted for mortality, immigration, or emigration, so it should not be read as the exact current age distribution of living people with that name.

Try it here: [What's in a Name?](/projects/name-analytics/).

Tech note: it runs entirely client-side. The page downloads a compressed SSA CSV, loads it into DuckDB-Wasm in a web worker, and runs the estimates in your browser, so there is no server-side database or API behind the tool.
