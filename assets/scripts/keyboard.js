function blogNav(key) {
	var postclass = "post-link";

	// convert HTMLCollection to array for indexing
	var blogposts = [].slice.call(document.getElementsByClassName(postclass));
	var postindex = -1; // initialize counter before the first post

	var currentfocus = document.activeElement; // get current index of focused post

	// open focused link
	if ( currentfocus.className === postclass && key === 'o' ) {
		window.location.href = currentfocus;
	}

	// get current post index
	if ( currentfocus.className === postclass ) {
		postindex = blogposts.indexOf(currentfocus);
	}

	// increment post index
	if ( key === 'j' && postindex < blogposts.length - 1 ) {
		postindex++;
	} else if (key === 'k' && postindex > 0 ) {
		postindex--;
	}

	// move focus
	blogposts[postindex].focus();
}

Mousetrap.bind({
	'g h': function() {	window.location.href = "/"; },
	'g b': function() {	window.location.href = "/blog"; },
	'g r': function() {	window.location.href = "/research"; },
	'j': function() { blogNav('j'); },
	'k': function() { blogNav('k'); },
	'o': function() { blogNav('o'); }
})
