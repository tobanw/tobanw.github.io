---
layout: post
title:  "Note taking like a hacker"
date:   2015-10-06 10:30:00
type: post
---
In the spirit of [blogging like a hacker][tom], I am now taking notes like a hacker, thanks to a system I pieced together using Markdown and Dropbox.
I have used Evernote and Google Docs for my notes in the past, but I was never satisfied.

I liked the idea of Markdown, and tried some online editors like [StackEdit][se] and [Laverna][lav].
This was a nice experience, but I was lured by the tantalizing prospect of editing the Markdown files in my text editor (vim), rather than the web editor.
(StackEdit can sync with Dropbox, allowing local editing of the plaintext files, but unfortunately, each file has to be synced manually, so you can't just sync a directory.)

My note taking system had to have these features:

- Markdown based
- Accessible across devices
- Edit notes in any text editor
- MathJax enabled for writing math with $$\LaTeX$$

I don't really care about embedding media or features like Evernote's clipping functionality.
As a PhD student, I mostly just want to save academic things like research ideas and paper summaries.

My system is minimal, but effective.
Notes are just Markdown files in my Dropbox.
On my desktop, I can edit them in any text editor.
With vim, I use the [vim-preview][vp] plugin to render an html preview.

On a mobile device, I can of course access the plaintext through the Dropbox app.
But there are also Markdown apps like [Jotterpad][jot] which can connect to Dropbox.

And that's it! Very simple, but now my notes are in a very portable format. (Speaking of which, I wrote a [little script][exp] to export notes from Laverna.)

[tom]:http://tom.preston-werner.com/2008/11/17/blogging-like-a-hacker.html
[se]:https://stackedit.io
[lav]:https://laverna.cc
[vp]:https://github.com/greyblake/vim-preview
[jot]:http://2appstudio.com/jotterpad/
[exp]:https://github.com/tobanw/laverna-export
