/**
 * Generic object shape used for Firestore document payloads.
 */
export type DocumentShape = Record<string, unknown>

/**
 * Custom claims shape stored under request.auth.token.
 */
export type CustomClaimsShape = Record<string, unknown>

/** Internal empty claims default used when no claims are provided. */
type EmptyClaims = Record<never, never>

/**
 * Database-level metadata.
 *
 * For now, only custom claims are supported.
 */
export interface DatabaseMeta<TCustomClaims extends CustomClaimsShape = EmptyClaims> {
  customClaims: TCustomClaims
}

/**
 * A typed Firestore collection definition.
 *
 * @typeParam TDocument - Document payload shape stored in this collection.
 * @typeParam TSubcollections - Nested subcollection map available under each document.
 *
 * @example
 * type UsersCollection = CollectionShape<{ name: string }>
 *
 * @example
 * type UsersCollectionWithPosts = CollectionShape<
 *   { name: string },
 *   {
 *     posts: CollectionShape<{ title: string }>
 *   }
 * >
 */
export interface CollectionShape<
  TDocument extends DocumentShape = DocumentShape,
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  TSubcollections = {},
> {
  readonly kind: "collection"
  readonly subcollections: TSubcollections
  readonly __document?: TDocument
}

/**
 * A map of top-level collection names to collection definitions.
 */
export type DatabaseShape = Record<string, CollectionShape<DocumentShape, DatabaseShape>>

/**
 * Full database definition returned by defineDatabaseShape.
 *
 * @example
 * type Db = DatabaseDefinition<
 *   {
 *     users: CollectionShape<
 *       { name: string; role: "admin" | "member" },
 *       {
 *         posts: CollectionShape<{ title: string; published: boolean }>
 *       }
 *     >
 *   },
 *   {
 *     admin: boolean
 *     orgId: string
 *   }
 * >
 */
export interface DatabaseDefinition<TShape, TCustomClaims extends CustomClaimsShape = EmptyClaims> {
  readonly collections: TShape
  readonly meta: DatabaseMeta<TCustomClaims>
}

/** Extracts top-level collection map from a database definition. */
type CollectionsOf<TDb> =
  TDb extends DatabaseDefinition<infer TShape, CustomClaimsShape> ? TShape : never

/**
 * Removes parameter segments from slash-delimited paths.
 *
 * Example: `users/{userId}/posts/{postId}` -> `users/posts`.
 */
type StripParamSegments<TPath extends string> = TPath extends `${infer Head}/${infer Tail}`
  ? Head extends `{${string}}`
    ? StripParamSegments<Tail>
    : StripParamSegments<Tail> extends infer Rest extends string
      ? Rest extends ""
        ? Head
        : `${Head}/${Rest}`
      : never
  : TPath extends `{${string}}`
    ? ""
    : TPath

/** Normalizes incoming collection paths by stripping route params. */
type NormalizeCollectionPath<TPath extends string> = StripParamSegments<TPath>

/**
 * Extracts custom claims from a database definition.
 */
export type CustomClaimsOf<TDb> = TDb extends {
  readonly meta: { customClaims: infer TCustomClaims }
}
  ? TCustomClaims
  : TDb extends DatabaseDefinition<unknown, infer TCustomClaims extends CustomClaimsShape>
    ? TCustomClaims
    : never

/**
 * Union of available collection names at the current shape level.
 */
export type CollectionNames<TDb> = CollectionNamesInShape<CollectionsOf<TDb>>

/** Internal helper to extract string collection keys from a shape. */
type CollectionNamesInShape<TShape> = Extract<keyof TShape, string>

/**
 * Extracts a document payload shape from a collection definition.
 */
export type DocumentOf<TCollection> = TCollection extends { readonly __document?: infer TDocument }
  ? NonNullable<TDocument>
  : never

/**
 * Extracts nested subcollection map from a collection definition.
 */
export type SubcollectionsOf<TCollection> = TCollection extends {
  readonly subcollections: infer TSubcollections
}
  ? TSubcollections
  : never

/**
 * Internal recursive collection resolver for slash-delimited collection paths.
 */
type CollectionAtPathInShape<
  TShape,
  TPath extends string,
> = TPath extends `${infer Head}/${infer Tail}`
  ? Head extends CollectionNamesInShape<TShape>
    ? CollectionAtPathInShape<SubcollectionsOf<TShape[Head]>, Tail>
    : never
  : TPath extends CollectionNamesInShape<TShape>
    ? TShape[TPath]
    : never

/**
 * Returns the collection definition at a slash-delimited collection path.
 *
 * Path format only includes collection names, for example: "users/posts/comments".
 */
export type CollectionAtPath<TDb, TPath extends string> = CollectionAtPathInShape<
  CollectionsOf<TDb>,
  NormalizeCollectionPath<TPath>
>

/**
 * Returns the document payload shape at a collection path.
 */
export type DocumentAtPath<TDb, TPath extends string> =
  CollectionAtPath<TDb, TPath> extends CollectionShape
    ? DocumentOf<CollectionAtPath<TDb, TPath>>
    : never

/**
 * Returns the subcollection map at a collection path.
 */
export type SubcollectionsAtPath<TDb, TPath extends string> =
  CollectionAtPath<TDb, TPath> extends CollectionShape
    ? SubcollectionsOf<CollectionAtPath<TDb, TPath>>
    : never

/**
 * Helper alias for the root-level document shape of a named collection.
 */
export type RootDocument<TDb, TCollection extends CollectionNames<TDb>> = DocumentOf<
  CollectionsOf<TDb>[TCollection]
>
