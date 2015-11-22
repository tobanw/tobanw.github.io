---
layout: default
title: Blog
nav: main
permalink: /blog/
---

<div class="main-list">

  <h1 class="title">Posts</h1>

  <ul class="post-list">
    {% for post in site.posts %}
	{% if post.type == "post" %}
      <li>
        <span class="post-meta">{{ post.date | date: "%B %-d, %Y" }}</span>

        <h2>
          <a class="post-link" href="{{ post.url | prepend: site.baseurl }}">{{ post.title }}</a>
        </h2>
      </li>
    {% endif %}
    {% endfor %}
  </ul>

  <p class="rss-subscribe">subscribe <a href="{{ site.data.theme.feedurl }}">via RSS</a></p>

</div>
