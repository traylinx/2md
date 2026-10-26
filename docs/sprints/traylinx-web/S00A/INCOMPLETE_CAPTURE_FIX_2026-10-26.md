---
title: Legacy conversion completeness repair
description: MiniMax reproduction, targeted browser-header and cache corrections, and release status.
---

# Legacy conversion completeness repair

**26 October 2026: implemented and tested locally; not deployed or published.**
This is a follow-up to the legacy web UI converter, not a Sentinel defect or a
change to the separate `/api/capture/v1` deployment.

## Reproduction and cause

The owner supplied `https://www.minimax.io/m-plan?tab=individual__monthly`.
A fresh production `/api/convert` call returned HTTP 200, `method: browser`,
`cache: miss`, but only 34 words and no plan content. The older conversion date in
the screenshot was a cache clue, not sufficient proof of the rendering cause.

An instrumented, temporary invocation of the existing fetch script found no
successful script responses and repeated Chromium `ERR_INVALID_ARGUMENT` console
errors. An extra nine-second wait still produced no main content. Removing the
globally forced navigation headers, while retaining the original resource filter
and wait, loaded the JavaScript and the plan content. Blocking stylesheets alone
did not reproduce the failure in the separate anonymous Chrome comparison.

The forced header set included `Sec-Fetch-Dest`, `Sec-Fetch-Mode`,
`Sec-Fetch-Site`, `Sec-Fetch-User`, `Accept` and `Upgrade-Insecure-Requests`.
Chromium now supplies its own per-resource values; only `Accept-Language` remains
explicit. No claim is made that one individually isolated header caused every
failure on other sites. No general wait increase or site-specific selector added.

## Cache repair

An isolated reproduction also showed `writeMeta` updating timestamps and content
hashes without replacing an existing Markdown file. The repair replaces both
files through same-directory temporary files, publishes metadata last and refuses
hash-mismatched pairs. Older entries without hashes remain readable. No live cache
purge was performed.

Endpoints, defaults, serializers, `force` behavior and hour-based `maxAge` are
unchanged. The existing query-independent cache key remains a known limitation;
this change is not a query-key migration or a multi-tenant cache redesign.

## Evidence

- Six isolated regression tests passed: safe browser headers/resource behavior,
  refresh replacement, content integrity, hashless legacy entries and cache flags.
- Thirty-one selected existing compatibility tests passed: conversion contracts,
  serializers, static/native behavior, browser flags, errors and disconnection.
- One candidate fetch → existing extraction → existing Markdown conversion ran
  in the current service environment using temporary data and an in-memory source
  override. Output grew from 871 bytes/34 words to 16,506 bytes/1,089 words and
  included M Plan, MiniMax Code, Go, Explore, Build and FAQs.
- The deployed fetch file's before/after hash was unchanged. Temporary diagnostic
  files were removed. This was candidate execution, not a deployed release.
- The first cache unit fixture omitted the VM's `URL` global. Correcting that test
  harness made the four affected cases pass; it was not an application defect.

Workspace evidence: `docs/evidence/html2md-minimax-incomplete-2026-10-26/`.
These checks do not certify every page, browser exploit isolation or throughput.

## Release next step

Package the exact legacy converter fix through the approved release path, then
deploy and refresh only the reported URL with the existing `force=true` option.
Verify both the fresh response and its next cache hit contain the plan sections.
Do not redeploy Sentinel, expand capture grants, purge other sites, publish the
public source/image implicitly or restart the separate capture service.
