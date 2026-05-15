# Changelog

## [1.3.0](https://github.com/huafu/firestore-rules-dsl/compare/v1.2.0...v1.3.0) (2026-05-15)


### Features

* ✨ type-safe lets inference, subcollection type fixes, and path param validation ([#32](https://github.com/huafu/firestore-rules-dsl/issues/32)) ([e254275](https://github.com/huafu/firestore-rules-dsl/commit/e254275984736c2cf5a60c6e7923f0ee15931c69))


### Bug Fixes

* 🐛 improve playground version display and source sanitizing ([#31](https://github.com/huafu/firestore-rules-dsl/issues/31)) ([7644eb8](https://github.com/huafu/firestore-rules-dsl/commit/7644eb858529ad1999bdef964835e85203db3a71))
* 🐛 support destructured builder methods in playground flow ([#29](https://github.com/huafu/firestore-rules-dsl/issues/29)) ([69cfef1](https://github.com/huafu/firestore-rules-dsl/commit/69cfef1ae07e1cc9364da65cbec0b8f618d74c92))

## [1.2.0](https://github.com/huafu/firestore-rules-dsl/compare/v1.1.1...v1.2.0) (2026-05-14)


### Features

* ✨ add zero-arg register shorthand ([#28](https://github.com/huafu/firestore-rules-dsl/issues/28)) ([cbb5e27](https://github.com/huafu/firestore-rules-dsl/commit/cbb5e27222e8a1820c05d713befbb69ea55802ca))
* add interactive playground demo sub-package ([#27](https://github.com/huafu/firestore-rules-dsl/issues/27)) ([bb06565](https://github.com/huafu/firestore-rules-dsl/commit/bb06565a6fb71fae8cd67a9288efaacfe0c2ad63))


### Bug Fixes

* 🐛 improve context helper typing and hasPath path inference ([#25](https://github.com/huafu/firestore-rules-dsl/issues/25)) ([0f4c03a](https://github.com/huafu/firestore-rules-dsl/commit/0f4c03ae86655af46320cbf61da324770d093d22))

## [1.1.1](https://github.com/huafu/firestore-rules-dsl/compare/v1.1.0...v1.1.1) (2026-05-13)


### Bug Fixes

* 🐛 restore helper library typing compatibility after auth proxy changes ([#23](https://github.com/huafu/firestore-rules-dsl/issues/23)) ([0d28728](https://github.com/huafu/firestore-rules-dsl/commit/0d28728a406609b6966f7331a4e350df967a5812))

## [1.1.0](https://github.com/huafu/firestore-rules-dsl/compare/v1.0.0...v1.1.0) (2026-05-13)


### Features

* ✨ make `_db` optional in `createTypesaurusRulesBuilder`, allow options as first arg ([#21](https://github.com/huafu/firestore-rules-dsl/issues/21)) ([0f7edb2](https://github.com/huafu/firestore-rules-dsl/commit/0f7edb28db0e30ae4078c8ffe3c7c920b033e30b))

## [1.0.0](https://github.com/huafu/firestore-rules-dsl/compare/v0.4.3...v1.0.0) (2026-05-13)


### ⚠ BREAKING CHANGES

* 💥 AST, context-level operators, comprehensive method TSDoc, real-world integration test ([#19](https://github.com/huafu/firestore-rules-dsl/issues/19))

### Code Refactoring

* 💥 AST, context-level operators, comprehensive method TSDoc, real-world integration test ([#19](https://github.com/huafu/firestore-rules-dsl/issues/19)) ([842fc03](https://github.com/huafu/firestore-rules-dsl/commit/842fc03454904a039f5ade6941361a8f4e5c410d))

## [0.4.3](https://github.com/huafu/firestore-rules-dsl/compare/v0.4.2...v0.4.3) (2026-05-10)


### Bug Fixes

* :bug: use relative path instead of absolute ones in match sections ([#17](https://github.com/huafu/firestore-rules-dsl/issues/17)) ([2ef229c](https://github.com/huafu/firestore-rules-dsl/commit/2ef229c33e881a0b7bc5e89216c32b0814feeeff)), closes [#16](https://github.com/huafu/firestore-rules-dsl/issues/16)
* 🐛 error when calling a registered helper with a path proxy as argument ([#15](https://github.com/huafu/firestore-rules-dsl/issues/15)) ([6bde646](https://github.com/huafu/firestore-rules-dsl/commit/6bde64689655f412a52bbefb2de050b4446a567a))

## [0.4.2](https://github.com/huafu/firestore-rules-dsl/compare/v0.4.1...v0.4.2) (2026-05-09)


### Bug Fixes

* :green_heart: testing submodule not exported ([#13](https://github.com/huafu/firestore-rules-dsl/issues/13)) ([2e77f1b](https://github.com/huafu/firestore-rules-dsl/commit/2e77f1b76d85fc3ae2b822fd8c8d31beb3a39ccf))

## [0.4.1](https://github.com/huafu/firestore-rules-dsl/compare/v0.4.0...v0.4.1) (2026-05-08)


### Bug Fixes

* 💚 empty release ([#11](https://github.com/huafu/firestore-rules-dsl/issues/11)) ([37a9c1a](https://github.com/huafu/firestore-rules-dsl/commit/37a9c1a9bb119037344926926e8ced8877c44c67))

## [0.4.0](https://github.com/huafu/firestore-rules-dsl/compare/v0.3.0...v0.4.0) (2026-05-08)


### Features

* ✨ add typed helper libraries and testing utilities ([#9](https://github.com/huafu/firestore-rules-dsl/issues/9)) ([edf8feb](https://github.com/huafu/firestore-rules-dsl/commit/edf8febb86de46bc5f7a439ab1bf69edaa54abd5))

## [0.3.0](https://github.com/huafu/firestore-rules-dsl/compare/v0.2.1...v0.3.0) (2026-05-03)


### Features

* ✨ variadic if/unless + auth claims fix ([#7](https://github.com/huafu/firestore-rules-dsl/issues/7)) ([f9ea4ff](https://github.com/huafu/firestore-rules-dsl/commit/f9ea4ffb7e092276cf238ae9d76dcc5df0d4a1e0))

## [0.2.1](https://github.com/huafu/firestore-rules-dsl/compare/v0.2.0...v0.2.1) (2026-05-03)


### Bug Fixes

* :bug: accept typed authClaims metadata without index signature ([655cc63](https://github.com/huafu/firestore-rules-dsl/commit/655cc634edf44138bc90f463769dfd579289185d))
* :bug: accept typed authClaims metadata without index signature ([719609b](https://github.com/huafu/firestore-rules-dsl/commit/719609b4a54d30b5ebfc257b60fa46b7952f0559))

## [0.2.0](https://github.com/huafu/firestore-rules-dsl/compare/v0.1.0...v0.2.0) (2026-05-03)


### Features

* :sparkles: add `when` and `default` context helpers ([bc598e1](https://github.com/huafu/firestore-rules-dsl/commit/bc598e129b63cb293c50f2f7834c7e55829c6eca))
* :sparkles: add Typesaurus schema support via dedicated subpath export ([#2](https://github.com/huafu/firestore-rules-dsl/issues/2)) ([2cae3dc](https://github.com/huafu/firestore-rules-dsl/commit/2cae3dc9da70d68cbd41157ec95b8c7335c2e865))
