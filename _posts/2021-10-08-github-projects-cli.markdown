---
layout: post
title:  "How to work with GitHub Projects from the Command Line"
date:   2021-10-08
categories: github cli bash
---

While I like the light-weightedness of GitHub's project management feature, I think that their user experience could benefit from some improvements.
For example, it is super annoying to create a new card in a certain column and attach some labels to it: You need to first create the card, convert it to an issue and only then you can add labels to it.

Luckily, GitHub has an API, so we can script this. In fact, GitHub even has an official [CLI][github-cli] so there's no need to lookup what payloads to send.

Except that it doesn't support project cards.

BUT! It does support extensions, so that's something we can use, can't we?

## The gh-project CLI Extension

I have created a simple GitHub CLI extension that allows you to work with projects from the command line.

Assuming you have installed the GitHub CLI, run the following command to install the GitHub project extension:

```bash
> gh extension install rethab/gh-project
```

Take a look at the [extension's readme][gh-project-readme] for a description of everything it can do, but the gist of it is that this allows you to create project cards with labels and put them into the right column in one command.
In other words: everything we want :)

## Take it for a Test-Drive

Let's first explore the projects available at `rethab/gh-project` using the `list` command:

```bash
gh project list --owner rethab --repository gh-project
ID        Name                URL
13373906  mission-impossible  https://github.com/rethab/gh-project/projects/1
```

Alright, there we have one. And what columns does this project's board have?

```bash
gh project list-columns --project 13373906
ID        Name
16122293  todo
16122294  in progress
16122295  done
```

Now that we know the columns, we can take a look at the cards in there:

```bash
gh project list-cards --column 16122293
ID        Note
69500456  make it dive
69500449  make it fly
```

Let's add a new one!

```bash
gh project create-card --column 16122293 --issue-repository gh-project --title "make it swim" --label "enhancement"
```

And that's it. Creating an extension for the CLI is a simple way to make a powerful tool even more powerful.

## Next steps

While the current version of the extension can create, list, and edit cards, there are still some quirks.
For example, GitHub differentiates between cards and issues. When you create a card and turn it into an issue, you loose the `note` (I believe that's the "content") of the card and the issue is referenced as the content instead.
This also means that listing cards doesn't show the title of the issue. We'd have to fetch the issues separately in order to do that.

I hope GitHub either improves the mechanics around that or I'm going to have to add this to the gh-project extension as well.

Are you missing something related to projects in the GitHub CLI?
Please feel free to head over to the GitHub repository [rethab/gh-project][gh-project-readme] and create an issue or even a pull request.

[github-cli]: https://cli.github.com/
[gh-project-readme]: https://github.com/rethab/gh-project
