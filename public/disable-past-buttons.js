setInterval( function() {
	var ul = document.getElementById("webchat").getElementsByTagName("ul")[1];
	if (!ul) {
		return;
	}
	Array.from(ul.getElementsByTagName('button'))
		.filter(function(button) { return !button.classList.contains("touched")})
		.forEach(function(button) {
			// console.log("touching", button);
			button.classList.add("touched");
			button.addEventListener("click", disablePastButtonsAndInputs);
		});
}, 10 );

function disablePastButtonsAndInputs() {
	var ul = document.getElementById("webchat").getElementsByTagName("ul")[1];
	this.classList.add("selected-button");
	Array.from(ul.getElementsByTagName('button'))
		.filter(function(button) { return !button.hasAttribute("disabled")})
		.forEach(function(button) {
			// console.log('disabling', button);
			button.setAttribute("disabled", true);
			button.classList.add("past");
		});
	Array.from(ul.getElementsByTagName('input'))
		.filter(function(input) { return !input.hasAttribute("disabled")})
		.forEach(function(input) {
			// console.log('disabling', input);
			input.setAttribute("disabled", true);
			input.classList.add("past");

		});

}
