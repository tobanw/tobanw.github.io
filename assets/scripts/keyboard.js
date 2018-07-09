var postclass = "post-link";

function blogNav(key) {

	// convert HTMLCollection to array for indexing
	var blogposts = [].slice.call(document.getElementsByClassName(postclass));
	var postindex = -1; // initialize counter before the first post

	var currentfocus = document.activeElement; // get current index of focused post

	// get current post index
	if ( currentfocus.className.includes(postclass) ) {
		postindex = blogposts.indexOf(currentfocus);
	}

	// increment post index
	if ( key === 'j' && postindex < blogposts.length - 1 ) {
		postindex++;
	} else if (key === 'k' && postindex > 0 ) {
		postindex--;
	} else if (key === 'g') {
		postindex = 0;
	} else if (key === 'G') {
		postindex = blogposts.length - 1;
	}

	// move focus
	blogposts[postindex].focus();
}

function kbLaunch() {
	var currentfocus = document.activeElement; // get current index of focused post
	// open focused link
	if ( currentfocus.className.includes(postclass) ) {
		window.location.href = currentfocus;
	}
}

Mousetrap.bind({
	'g h': function() {	window.location.href = "/"; },
	'g b': function() {	window.location.href = "/blog"; },
	'g p': function() {	window.location.href = "/projects"; },
	'j': function() { blogNav('j'); },
	'k': function() { blogNav('k'); },
	'g g': function() { blogNav('g'); },
	'G': function() { blogNav('G'); },
	'o': function() { kbLaunch(); }
})
