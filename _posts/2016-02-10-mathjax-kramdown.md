---
layout: post
title:  "MathJax with Kramdown"
date:   2016-02-10 10:30:00
type: post
---
Last week, GitHub Pages [upgraded to Jekyll 3.0][jekyll].
One major consequence of the upgrade is that, for Jekyll sites hosted on GitHub Pages, _only_ the `kramdown` engine is supported.

This broke my existing MathJax setup -- I was using the `redcarpet` Markdown engine before, which understood math with the delimiters `\\( \LaTeX \\)` and `\\[ \LaTeX \\]` for inline and displayed math, respectively.

`kramdown` only recognizes `$$ \LaTeX $$` for _both_ inline and displayed math.
This means that it will automatically infer whether you want inline or displayed math.

Here's the live demo with inline $$ \LaTeX $$ and displayed

$$ \LaTeX $$

This is an easy fix unless you have a lot of old posts with LaTeX to convert, in which case you should probably write a small converter script to switch your math delimiters to `$$`. 

[jekyll]:https://github.com/blog/2100-github-pages-now-faster-and-simpler-with-jekyll-3-0
