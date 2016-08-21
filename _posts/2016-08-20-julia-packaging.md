---
layout: post
title:  "Make your own Julia packages"
date:   2016-08-20 20:30:00
type: post
---
[Julia][julia] is a fantastic language for scientific computing and as a result is gaining traction among researchers.
In research projects, it often happens that you need to write code which could be generalized and reused.
For example, in a recent project, I coded up a [marriage market model][marriagemarkets] as a component of a larger model.
The best way to make such code reusable is to create a package (most languages provide a packaging system).

Julia provides a convenient way to create a new package.
As explained in [the manual][packages], `Pkg.generate("NewPackage", "MIT")` initializes a git repo containing the package structure for a package named `NewPackage` with an MIT license.
If you configure your GitHub username in git (`git config --global github.user "USERNAME"` ), it will even configure the remote repository (which you'll still need to create in GitHub).

Since the Julia package directory isn't a very convenient location for developing your package (`~/.julia/v0.4/`), I recommend moving your package (cut and paste) to your desired location and then symlinking it to the Julia package directory (`ln -s your/directory/NewPackage ~/.julia/v0.4/NewPackage`).

Converting your code into a package takes a few simple steps.
`src/NewPackage.jl` contains the actual module that users will import.
The manual explains how to [create a module][modules].
You simply define functions and types and use the `export` statement to choose which ones to make available externally.
A good way to organize your code is to put it in the `src` directory and then `include()` it in the module file.

Next, you should specify which packages are required as dependencies in the `REQUIRE` file.
The file already includes the current stable version of Julia as a requirement.

While optional, it's a good idea to include some tests of your code!
Put them in `test/runtests.jl` and run `Pkg.test("NewPackage")` to run your tests.
If you enable Travis CI in GitHub, it will automatically run your tests when you `git push`.

Finally, don't forget to fill out the `README.md`!

To share your package with others, push it to GitHub and then [others can install it][install] with `Pkg.clone("git@github.com:username/NewPackage.jl.git")`.
The manual also has instructions for registering your package as an official Julia package that can be installed with `Pkg.install()`.

Look at [my package][marriagemarkets] for a simple example.
The [QuantEcon][quantecon] package is a more comprehensive example that I drew on in making my package.

[julia]:http://julialang.org/
[packages]:http://docs.julialang.org/en/release-0.4/manual/packages/#creating-a-new-package
[modules]:http://docs.julialang.org/en/release-0.4/manual/modules/
[install]:http://docs.julialang.org/en/release-0.4/manual/packages/#installing-unregistered-packages
[marriagemarkets]:https://github.com/tobanw/MarriageMarkets.jl
[quantecon]:https://github.com/QuantEcon/QuantEcon.jl
