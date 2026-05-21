---
title: "Find Your Community: Increasing user engagement at Reddit"
date: "2017-06-22 20:00:00"
permalink: "/blog/2017/06/reddit-engagement/"
description: "Toban Wiebe is an Insight Data Science Fellow in Silicon Valley. For his fellowship project, he performed an analysis of Reddit user engagement to provide actionable insigh..."
math: true
---

*Toban Wiebe is an Insight Data Science Fellow in Silicon Valley.
For his fellowship project, he performed an analysis of Reddit user engagement to provide actionable insights for the business.*

<img src="https://assets.ifttt.com/images/channels/1352860597/icons/on_color_large.png" alt="Reddit logo" style="float:right;">
[Reddit](https://www.reddit.com/) is a social media platform where people can browse or join communities called *subreddits* to submit posts as well as vote and comment on submissions.
Any user can create a subreddit — as a result, there are now [over 1 million subreddits](http://redditmetrics.com/history#tab2) spanning almost any topic imaginable.
Subreddits are based around topics such as [r/cats](https://www.reddit.com/r/cats/) or [r/datascience](https://www.reddit.com/r/datascience/).

When someone first visits [reddit.com](https://www.reddit.com), they are shown the reddit *frontpage*, a post feed comprised of the currently most popular content from a curated selection of 50 *default* subreddits.
(Note: this has recently changed to showing popular posts from any subreddit, with some exceptions. However, this only affects new accounts — existing users still see the default frontpage subreddits).
Logged-in users (also called redditors) can customize their feed by subscribing to other subreddits; otherwise they see the default frontpage content.

However, while frontpage subreddits are prominently featured, the web interface doesn't make it very obvious how to find other subreddits.
Reddit has a very useful [subreddit discovery feature](https://www.reddit.com/subreddits/), but it's only accessible through the small "More" link in the subreddit navigation bar at the top of the page.
This made me wonder: *would reddit benefit from making subreddit discovery more prominent in the user interface?* 
To answer this question, I analyzed user engagement across subreddits to look for evidence of a causal relationship.

## Data

Data on all reddit comments is [publicly available on Google BigQuery](https://bigquery.cloud.google.com/dataset/fh-bigquery:reddit_comments) thanks to redditor [fhoffa](https://www.reddit.com/user/fhoffa).
The data is very large and is divided into monthly tables — the table for May 2017 alone contains 80 million rows and takes up 20GB on disk.
As such, it was very important to use BigQuery for performant queries.

To access the data, I used the [Google Cloud Datalab](https://cloud.google.com/datalab/), a Jupyter notebook environment running on a VM instance which connects to BigQuery.
By using SQL queries to aggegate the data down to a manageable size, I could load the results into pandas dataframes for my analyses.


## Analysis of user engagement 

As reddit content is entirely user-generated, I decided to focus on commenting as a proxy for adding value to the reddit experience.
Comments are an integral part of reddit — as many a redditor knows, discussions in the comments often contain some of the most valuable content.
For each user, I calculated the *number of monthly comments* as a metric for user engagement.

### Frontpage subreddits vs the rest

The distinction between the frontpage and other subreddits is a key divide in the spectrum of reddit usage styles.
On one end of the spectrum are the "frontpage-focused" users; at the other end are the users who participate solely in non-frontpage subreddits.
To measure this, I calculated a participation metric: the *percentage of comments outside of frontpage subreddits* for each user in each month.

The frontpage surfaces excellent content with broad appeal and is extremely popular.
However, the frontpage default subreddits only produce 17% of all reddit comments, despite their outsized popularity.
Other subreddits vary widely, but many thriving communities are based around a specific interest, such as [r/coffee](https://www.reddit.com/r/Coffee/).

Based on my experience as a redditor, I hypothesized that people would get the most value out of reddit by going beyond the frontpage and finding subreddits related to their specific interests.
As a result, they would become more engaged in those communities and leave more comments overall.
However, given the popularity of the frontpage, it wasn't obvious that this would be true.

### Initial cohort-level analysis

I started by looking at the relationship between engagement and participation in other subreddits at the cohort level in order to avoid selection bias from tenure.
For example, people who have been on reddit longer are likely to be both more engaged as well as participate more broadly in other subreddits.

I took four monthly cohorts (from July to October of 2016) and measured their commenting activity in their 6th month of tenure.
As I suspected, there is a strong relationship between engagement and participation in other subreddits.
The chart below shows that "frontpage-focused" users (0-20% of comments outside of frontpage subreddits) have the lowest engagement with an average of 22.8 comments per month.
Engagement increases by *22.7%* to an average of 27.8 comments per month for users with the majority of their comments outside of frontpage subreddits.
The difference between the first two groups is 2.55 with a 99% confidence interval of (1.69, 3.41).

![engagement-chart](https://i.imgur.com/GQtdM93.png)

(Note: This chart is limited to users with 5-150 comments per month, to exclude outliers and low comment counts, which could skew the results.
I also excluded the 80-100% group, which is almost entirely composed of users who never comment on frontpage subreddits.
This group is large and behaves very differently — likely because they joined reddit to participate in a specific subreddit, with no interest in the frontpage.
As my focus is on increasing engagement for frontpage-focused users, I restricted my analysis to users with at least some frontpage engagement.)

Furthermore, there are many users in this frontpage-focused group, so there are potentially large gains to be made from helping them to discover other subreddits.
The chart below adds bars for the number of users in each group (the average number per monthly cohort).

![counts-chart](https://i.imgur.com/xpmMgsZ.png)

### Panel data analysis

Though my cohort analysis controlled for the selection bias from tenure, I was worried that it was being confounded by another selection effect: what if the more highly engaged users within each cohort are more likely to seek out other subreddits?
To control for this, I constructed a panel dataset to quantify the effect at the user level.
This way, I could directly see how each user's engagement changes over time as their participation shifts to other subreddits.

Formally, I modeled this with user fixed-effects in a linear model:

$$ y_{it} = \alpha_i + \beta^{\prime} x_{it} + \varepsilon_{it}. $$

Here, $ y_{it} $ is the engagement of user $ i $ in month $ t $.
$ \alpha_i $ is the user fixed-effect.
$ x_{it} $ is a vector which includes the participation metric (% of comments outside of frontpage subreddits) as well as user tenure.
As I don't care about recovering the fixed-effects, I differenced them out to get the ["within" estimator](https://en.wikipedia.org/wiki/Fixed_effects_model):

$$ y_{it} - \bar y_{i} = \beta^{\prime} (x_{it} - \bar x_{i}) + (\varepsilon_{it} - \bar \varepsilon_{i}). $$

I ran this linear regression on all users who joined reddit within the last two years, which gave me 14 million user-month observations.
This also yielded a positive effect, with an estimated 0.38 more monthly comments per user for every 10 percentage point increase in participation outside of the frontpage (with a 95% confidence interval of (0.35, 0.41)).

However, this is only about half of the effect size suggested by the above cohort-based analysis.
This means that selection on engagement was confounding the previous analysis.
Still, the estimated effect is quite substantial: if a frontpage-focused user shifted their participation to 70% outside of frontpage subreddits, that would induce an average increase of **11.6%** in engagement. 

![regression-chart](https://i.imgur.com/tbhKmSw.png)

For comparison, an extra year of tenure on reddit is associated with a 7% increase in engagement.

## Proposed feature and A/B test

Based on this evidence, I conclude that reddit should do more to help frontpage-focused users discover other communities.
Specifically, I propose adding a subreddit discovery feature into the frontpage sidebar.
This way, subreddit discovery would be much more evident to frontpage visitors.

To evaluate the impact of this proposed sidebar feature (and to establish whether my finding is indeed a causal relationship), I designed an A/B test that could be implemented by reddit.
The goal of the experiment is to determine if this feature increases the commenting activity of frontpage-focused users.

### Target group

The experiment targets existing frontpage-focused users: registered users with some commenting activity, but who haven't subscribed to any other subreddits (and hence still see the default frontpage).
I also limited the experiment to users that joined in 2016 to avoid potential bias from older cohorts, and also because the newest cohorts are by far the largest.
(Though it is typical to target newly registered users, reddit is [already running](https://www.reddit.com/live/x3ckzbsj6myw/updates/bb55d54c-7f79-11e6-bf48-0eeb724eeebd) an A/B test for subreddit discovery during the onboarding flow. As such, my proposed test focuses on existing users.)

### Duration and metrics

The test would run for 5 weeks in total.
The first week would be an adaptation period for users to try out the feature and subscribe to other subreddits.
Then, the following 4 weeks would track the number of comments for each user.

An important secondary metric to track is the number of subscriptions to other subreddits.
This tells us how effective the feature is at driving users to find other communities.

### Power analysis

Unlike most other social media platforms, reddit is very conservative about changing the user experience (and primarily [runs A/B tests](https://www.reddit.com/live/x3ckzbsj6myw/) to learn more about its users).
As such, I tailored the design of the test to reflect this cautious approach.

I set the test significance at $\alpha = 0.01$ to be very stringent with respect to false positives.
I set the power at $1 - \beta = 0.9$ to reflect less concern about false negatives.
This way, a positive result would be very strong grounds for launching the feature.

The minimum detectable effect size that would be worthwhile should be based on the tradeoff between the value of additional comments and the opportunity cost of sidebar space (which would otherwise be ad space).
As I don't have this information, I chose an intuitively plausible effect of 5%, or about 1 extra comment per user per month, on average.

To reduce the number of users exposed to the new feature, I used an unbalanced design with a much larger control group.
I started from a total sample size of 27,000 users because that is roughly the number of frontpage-focused users among all of the 2016 cohorts.
This is more than enough for a balanced design, so I minimized the treatment group size subject to the other constraints.
This gave me a sample size of 7,000 users in the treatment group and 20,000 users in the control group.

### Impact

There are roughly 300,000 actively commenting users who only comment on the frontpage, so a 5% increase in their commenting would result in an overall increase of roughly 0.5% in commenting across all of reddit!
This effect could also grow over time as these users continue to explore other subreddits. 
Moreover, this is only considering the impact from users who are commenting at all — presumably there are far more users who never comment at all.


## Conclusion

Reddit's mission is "to help people discover places where they can be their true selves".
This fits nicely with my recommendation of making community discovery more prominent in the user interface.
Furthermore, helping people to find other communities has a direct financial impact as reddit sells [targeted subreddit ads](https://static.reddit.com/marketing/subreddit_targeting_manual.pdf).
All told, my analysis suggests that reddit could benefit substantially from improving the subreddit discovery process, and it would be well worth running an experiment to precisely quantify this impact.
