#Setup and usage
##Install jekyll
Linux, Mac, Windows.

## Clone the repo
```
cd location/to/hold/repo
git clone git@github.com:pennea/pennea.github.io.git
```

## Basic local usage
To launch a local webserver that will build and show the site, as well as watch for any changes, run this from the command line:
```
cd path/to/pennea-repo
jekyll serve
```
Leave that terminal window running (you can see it rebuilding the site every time you edit a file) and point your browser to `http://localhost:4000`.

## Testing for launch
You can run `jekyll` under the same conditions as Github Pages will.

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

## Events
Events are just posts with different metadata: the categories should include `event` and the fields `guest` and `location` should be added. The date field should be the event start time. For example:
```
---
layout: post
guest:  "Guest name"
title: "Name of event"
date:   2015-08-15 18:30:00
location: "Building, Room number<br>Street address"
categories: event
---
```

## Pages
Pages such as `about` are simply markdown files in the root directory of the repo. The permalink field can be used to specify the url of the page.

# Tips and tricks

- 'for loops' go in reverse filename order, so posts --- which are named by date --- get displayed newest first

# Quirks

- github appears to only regenerate the site if there are changes in the repo --- as such, things like the event sidebar which only shows upcoming events won't update
