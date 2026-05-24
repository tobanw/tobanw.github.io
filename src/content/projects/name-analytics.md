---
title: "What's in a Name?"
summary: "An interactive estimator for whether a first name is old, new, making a comeback, going out of style, and how popular it is."
url: "/projects/name-analytics/"
year: 2026
tags: ["data", "bayes", "duckdb"]
featured: true
---

Type a first name, choose a sex, and estimate the birth-cohort distribution from the Social Security baby names dataset.

In plain English, it answers two questions: whether a name is mostly old, new, making a comeback, or going out of style; and how popular it is compared with other names in any given birth year.

Two handy use-cases. First, if you get an email, resume, or other note from someone, it can give you a sense of their likely age based on their first name. For example, [Harold](/projects/name-analytics/?name=Harold&sex=M) reads older and [Logan](/projects/name-analytics/?name=Logan&sex=M) reads younger. Second, if you're hunting for baby names, it helps separate names that are on the rise from names that are already hot, declining, or outdated. For example, [Wells](/projects/name-analytics/?name=Wells&sex=M) is on the rise; [Harvey](/projects/name-analytics/?name=Harvey&sex=M) is an old name making a comeback; [Aiden](/projects/name-analytics/?name=Aiden&sex=M) was hot but has peaked and is going out of style, much like [Cody](/projects/name-analytics/?name=Cody&sex=M) peaked in the early 90s.

Tech note: it runs entirely client-side. The page downloads a compressed SSA CSV, loads it into DuckDB-Wasm in a web worker, and runs the estimates in your browser, so there is no server-side database or API behind the tool.
