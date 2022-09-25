---
layout: post
title:  "How well do you know GitHub Actions?"
date:   2022-09-25
categories: github actions devops tricks pitfalls
---

During one of my assignments, I worked with GitHub Actions pretty much every day.
I implemented workflows, created new actions, and helped people migrate their projects from jenkins to actions.

As much as I like actions -- and I like them a lot -- there are some things that caught me off guard.
I have collected some of these things, both for other people to let them know, and for myself as a future reference.

How well do you know actions?
Can you answer all of these questions correctly?

ℹ️ Assume that all YAML and code is valid/compiles

## Output from a previous job

What does the following print?

```yaml
jobs:
  jobOne:
    runs-on: ubuntu-latest
    outputs:
      foo: ${{ steps.foo.outputs.foo }}
    steps:
      - run: echo '::set-output name=foo::bar'
        id: foo
      
  jobTwo:
    needs: jobOne
    runs-on: ubuntu-latest
    steps:
      - run: echo hello
        
  jobThree:
    needs: jobTwo
    runs-on: ubuntu-latest
    steps:
      - run: echo ${{ needs.jobOne.outputs.foo }}
```

Solution:
It prints an empty line, because if you want to access an output from a job, you need to list it as a dependency.
Outputs from transitive dependencies cannot be accessed.

To fix this, make the third job depend on the first job explicitly `needs: [jobOne, jobTwo]`

## Exec explodes

GitHub provides action developers with a [toolkit](https://github.com/actions/toolkit) to develop actions in JavaScript.
One of the functions in there is called `exec` and can be used to run a command.
Here's its [signature](https://github.com/actions/toolkit/blob/main/packages/exec/src/exec.ts#L17):

```typescript
/**
 * Exec a command.
 * Output will be streamed to the live console.
 * Returns promise with return code
 *
 * @param     commandLine        command to execute (can include additional args). Must be correctly escaped.
 * @param     args               optional arguments for tool. Escaping is handled by the lib.
 * @param     options            optional exec options.  See ExecOptions
 * @returns   Promise<number>    exit code
 */
export async function exec(
  commandLine: string,
  args?: string[],
  options?: ExecOptions
): Promise<number>
```

In an action, you might use it like so:

```typescript
const returnCode = await exec.exec('node', ['index.js']);
if (returnCode != 0) {
    console.error('Uh! Something did not quite work :(')
}
```

Do you see any problems with that code?

The problem is that `exec` does not return a non-zero return code if the command fails.
Instead, it returns a rejected promise.

So if you want to handle the error case, you need to wrap it in a try-catch block.

While this behavior can be changed by passing [ignoreReturnCode](https://github.com/actions/toolkit/blob/main/packages/exec/src/interfaces.ts#L28) as the third argument `ExecOptions`, the default behavior is very surprising.
I have seen many examples of people checking the return code without knowing how this function really behaves.

Nevertheless, I still think throwing an error by default is probably not a bad choice, given that (A) many people ignore error handling and (B) you probably want to abort on error.

## Push for all?

Say you're working on your open source project, and you just started using actions to make sure the build always passes:

```yaml
on: push

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      # etc..
```

The `push` trigger seems to do the trick in all cases:
You can push to a branch (or pull request) and the build runs.
You can push to the main branch and the build runs.

But there's a scenario where it won't run. Do you know when?

Solution: If I fork your project and create a pull request, then [push won't trigger](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#pull-request-events-for-forked-repositories-2).
If you want the PRs of external contributors to be validated with your workflows as well, you need to use the trigger `pull_request`.
And once you do that, you also need to make sure the `push` only triggers on main, because otherwise your own pull requests will trigger the workflow twice (both from `push` and `pull_request`):

```yaml
on:
  pull_request:
  push:
    branches: [main]
```

When talking about running actions from contributors, it is important to mention that:

- You can control how actions are triggered in pull requests from forks by [Approving workflow runs from public forks](https://docs.github.com/en/actions/managing-workflow-runs/approving-workflow-runs-from-public-forks)
- Secrets are generally not available in PRs from forks, except for `$GITHUB_TOKEN`, which is read-only.
  There's a trigger called `pull_request_target` to work around that, but you need to be [careful](https://securitylab.github.com/research/github-actions-preventing-pwn-requests/) as this open up the gates for potential vulnerabilities.

## Too much information, GitHub

Say I have an open pull request based on a branch called `my-feature`, and the following workflow is triggered.
What does it print?

```yaml
on: pull_request

jobs:
  branch:
    runs-on: ubuntu-latest
    steps:
      - run: echo {% raw %} ${{ github.ref_name }} {% endraw %}
```

I'll even give you the docs on [`github.ref_name`](https://docs.github.com/en/actions/learn-github-actions/contexts#github-context):

> The short ref name of the branch or tag that triggered the workflow run. This value matches the branch or tag name shown on GitHub. For example, `feature-branch-1`.

I'm going to guess you said `my-feature`, but unfortunately you're wrong.

It is going to print the PR number followed by `/merge`.
For example, it would print `18/merge` for the 18th pull request in your repository.

Why is that? 🤔

The simple explanation is that when you create a pull request on GitHub, they create some additional internal(!) branches to make it easier for them to manage your pull request and tell you how it compares to the branch you want to merge into.
As a result of that, when you run a workflow on a `pull_request` event, it runs on one of these "internal" branches rather than the one you just pushed.
In terms of contents on your branch, this doesn't make a difference -- you're still running your builds and tests on your contents -- it's just the branch name that is different.

Unfortunately, this implementation detail is exposed here.

Please see this [answer on stackoverflow](https://stackoverflow.com/a/63595981/1080523) for more information.

_Note that `$GITHUB_SHA` is [not what you'd expect](https://github.com/orgs/community/discussions/26325) either_

So how can you access the name of your branch in a pull request?
It's in the payload from the event:

```yaml
on: pull_request

jobs:
  branch:
    runs-on: ubuntu-latest
    steps:
      - run: echo ${{ github.event.pull_request.head.ref }}
```

## Bonus: Am I there or not?

Consider this reusable workflow:

```yaml
on:
  workflow_call:
    inputs:
      my-input:
        description: optional input
        required: false
        type: string

jobs:
  greet:
    runs-on: ubuntu-latest
    steps:
      - uses: my/action@v1
        with:
          my-input: ${{ inputs.my-input }}
```

Let's say the action `my/action@v1` has an optional input `my-input` which has a default value `my-value`.
Now if you were to call the reusable workflow as shown in the following example, what value would be passed to `my/action@v1`?
Would the default be used?

```yaml
jobs:
  jobA:
    uses: org/repo/.github/workflows/workflow.yml@v1
```

Solution: An empty string is passed to `my/action@v1` as `my-input`.

The way this works is that if no value is passed to the reusable workflow, then the input `my-input` is still passed to the action, but it's passed as an empty string.
And even though we usually see an empty string as "no value passed", the default value is not used here, because we did pass _something_.

If you wanted to use the default value if no input was passed, then you'd have to invoke the action differently based on whether the input was passed to the reusable workflow.

```yaml
steps:
  - uses: my/action@v1
    if: inputs.my-input
    with:
        my-input: ${{ inputs.my-input }}
  - uses: my/action@v1
    if: inputs.my-input == ''
```

This has been a [long-standing issue](https://github.com/actions/runner/issues/924) in the runner, but there's likely no easy solution that does not break existing workflows.
