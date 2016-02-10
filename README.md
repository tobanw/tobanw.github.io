#Setup
##Install ruby
Linux, Mac, Windows...

##Install bundler
From the command line (aka Terminal or shell):

```
gem install bundler
```

##Clone the repo
Then make a directory for the site repository, navigate to it in the command line, and clone the repo to your computer:

```
cd location/to/hold/repo
git clone https://github.com/tobanw/lagom.git
```

The cloning url is always listed on GitHub.

##Install Jekyll and its dependencies
From the repository directory, simply run

```
bundle install
```

This command will use `Gemfile` (in the repository) to generate the `Gemfile.lock` and install the dependencies specified therein.

# Basic local usage
To launch a local webserver that will build and show the site, as well as watch for any changes, run this from the command line:

```
cd path/to/pennea-repo
bundle exec jekyll serve
```
Leave that terminal window running (you can see it rebuilding the site every time you edit a file) and point your browser to `http://localhost:4000`.

*Note*: Jekyll will _not_ automatically track changes to `_config.yml`, so if you modify that file, you need to shut down the server (Ctrl+C) and relaunch it.

## Publishing to the web
Just push your changes to the github repo and github will do the rest.

# Adding content
You can (and should) look at existing instances to see how to add content. Here's an outline to get started:

## Blog posts
A blog post is simply a markdown file in the `_posts/` folder that is categorized as a blog in the metadata. To add a post, create a markdown file with the appropriate filename format (`YYYY-MM-DD-name-of-post.md`) and fill in the post metadata as follows, being sure to include `blog` under categories:

```
---
layout: post
title:  "Name of post"
date:   2015-07-29 23:31:00
categories: blog
---
```

Then add your content (written in markdown).

## Pages
Pages such as `about` are simply markdown files in the root directory of the repo. The permalink field can be used to specify the url of the page.

## Math
MathJax is supported by Kramdown, but only with `$$` as delimiters, both for inline and displayed equations.
This means that it will automatically infer whether to display inline or not.
For example,

```
This is some inline math $$ \LaTeX $$. And here's a displayed equation

$$ \LaTeX $$
```

# Tips and tricks

- 'for loops' go in reverse filename order, so posts --- which are named by date --- get displayed newest first

# Quirks

- github appears to only regenerate the site if there are changes in the repo --- as such, things like an event sidebar which only shows upcoming events won't update, which could result in past events showing up
