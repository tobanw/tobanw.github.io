---
layout: post
title:  "Simple keyboard shortcuts for any website"
date:   2015-11-28 16:30:00
type: post
---
I'm a huge fan of Gmail's vim-inspired keyboard shortcuts.
It's been nice to see the adoption of keyboard shortcuts in other sites, but for most of the web, keyboard access remains completely ignored.
I always just figured that it must be prohibitively difficult to implement keyboard shortcuts in a website, and so only the big players could do it.
It turns out, however, that implementing keyboard shortcuts is embarassingly easy.

With no knowledge of javascript, I was able to add some simple keyboard navigation to this website ([source repo](https://github.com/tobanw/tobanw.github.io)).
Though this website is built with [Jekyll](http://jekyllrb.com/), this method would work on any website as it only uses some simple client-side javascript.
I used the excellent [Mousetrap](https://craig.is/killing/mice) library to handle keyboard input, and wrote some simple [navigation commands](https://github.com/tobanw/tobanw.github.io/blob/master/assets/scripts/keyboard.js) in javascript.

I implemented two kinds of navigation in the spirit of Gmail: jumping and list navigation.
(Note: I'm using the [bind dictionary](https://github.com/ccampbell/mousetrap/tree/master/plugins/bind-dictionary) extension to bind multiple keys at once):

### Jumping

To get <`g` then `h`> style jumping, all you need is:

```javascript
Mousetrap.bind({
	'g h': function() {	window.location.href = "/"; },
	'g b': function() {	window.location.href = "/blog"; },
	'g r': function() {	window.location.href = "/research"; },
})
```

That's it: incredibly simple.

### Blog post navigation

Adding j/k navigation was a little more complicated.
I wrote [a function](https://github.com/tobanw/tobanw.github.io/blob/master/assets/scripts/keyboard.js) `blogNav` which takes key and does the following:

- gets a list of all the post links (using their unique class, `post-link`)
- gets the currently focused element
- moves the link focus accordingly ('j/k'), or launches the focused link ('o')

I also tweaked the CSS to change the color of focused links. 
To bind it in Mousetrap:

```javascript
Mousetrap.bind({
	'j': function() { blogNav('j'); },
	'k': function() { blogNav('k'); },
	'o': function() { blogNav('o'); }
})
```

### Conclusion

Adding keyboard shortcuts to a website is surprisingly easy.
It's unfortunate that most web development is entirely focused on mouse input, relegating keyboard users to hacky extensions like [vimium](https://vimium.github.io/) and [pentadactyl](http://5digits.org/pentadactyl/).
Hopefully [Mousetrap](https://craig.is/killing/mice) can help more websites become keyboard friendly.
