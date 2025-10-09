export const typeDefs = `#graphql
  scalar Upload

  type Query {
    hello: String
    health: String
    user(id: Int!): User
    users: [User!]!
    images: [Image!]!
    image(id: ID!): Image
    imagesInArea(bounds: BoundsInput!): [Image!]!
    annotations(assetId: ID!): [Annotation!]!
    annotation(id: ID!): Annotation

    # Entity queries
    entities(entityType: String, limit: Int, offset: Int): [Entity!]!
    entity(id: ID!): Entity
    searchEntities(query: String!, entityType: String, limit: Int): [Entity!]!
  }

  type Mutation {
    login(username: String!, password: String!): AuthPayload!
    createUser(username: String!, email: String!, password: String!): User
    updateUser(id: Int!, username: String, email: String): User
    deleteUser(id: Int!): Boolean
    uploadImage(file: Upload!): Image!
    uploadImages(files: [Upload!]!): [Image!]!
    deleteImage(id: ID!): Boolean!

    # Annotation mutations
    createAnnotation(input: CreateAnnotationInput!): Annotation!
    updateAnnotation(id: ID!, input: UpdateAnnotationInput!): Annotation!
    deleteAnnotation(id: ID!): Boolean!
    addAnnotationRegion(annotationId: ID!, input: AddRegionInput!): AnnotationRegion!
    updateAnnotationRegion(id: ID!, input: UpdateRegionInput!): AnnotationRegion!
    deleteAnnotationRegion(id: ID!): Boolean!

    # Entity mutations
    createEntity(input: CreateEntityInput!): Entity!
    updateEntity(id: ID!, input: UpdateEntityInput!): Entity!
    deleteEntity(id: ID!): Boolean!
    addEntityAttribute(entityId: ID!, input: AddEntityAttributeInput!): EntityAttribute!
    updateEntityAttribute(id: ID!, input: UpdateEntityAttributeInput!): EntityAttribute!
    deleteEntityAttribute(id: ID!): Boolean!

    # Entity-Annotation linking mutations
    linkEntityToAnnotation(annotationId: ID!, entityId: ID!, relationType: String, confidence: Float, notes: String): AnnotationEntityLink!
    unlinkEntityFromAnnotation(linkId: ID!): AnnotationEntityLink!
  }

  type AuthPayload {
    token: String!
    user: User!
  }

  type User {
    id: ID!
    username: String!
    email: String!
    full_name: String
    role: String!
    active: Boolean!
    created_at: String
    updated_at: String
  }

  type Image {
    id: ID!
    filename: String!
    originalName: String!
    filePath: String!
    sha256Hash: String!
    fileSize: Int!
    mimeType: String!
    width: Int
    height: Int

    # GPS and location data
    latitude: Float
    longitude: Float
    altitude: Float
    orientation: Int

    # Camera information
    cameraMake: String
    cameraModel: String
    lens: String

    # Exposure settings
    iso: Int
    aperture: Float
    shutterSpeed: Float
    exposureProgram: Int
    exposureBias: Float
    meteringMode: Int

    # Lens and focus
    focalLength: Float
    focalLength35mm: Int

    # Flash
    flash: Int
    flashMode: String

    # Image properties
    colorSpace: Int
    whiteBalance: Int

    # Timestamps
    captureTimestamp: String
    uploadedAt: String!

    # Metadata
    software: String
    copyright: String
    artist: String
    uploadedBy: ID

    # Full EXIF and metadata
    exifData: JSON
    metadata: JSON

    # Relationships
    annotations: [Annotation!]!
  }

  input BoundsInput {
    northEast: CoordinateInput!
    southWest: CoordinateInput!
  }

  input CoordinateInput {
    lat: Float!
    lng: Float!
  }

  enum AnnotationShapeType {
    BOX
    POINT
  }

  type Annotation {
    id: ID!
    assetId: ID!
    asset: Image
    createdBy: ID
    title: String
    description: String
    regions: [AnnotationRegion!]!
    tags: [String!]
    entityLinks: [AnnotationEntityLink!]
    createdAt: String!
    updatedAt: String!
    metadata: JSON
  }

  type AnnotationRegion {
    id: ID!
    annotationId: ID!
    shapeType: AnnotationShapeType!
    coordinates: JSON!
    style: JSON
    createdAt: String!
  }

  type AnnotationEntityLink {
    id: ID!
    annotationId: ID!
    entityId: ID!
    entity: Entity
    relationType: String
    confidence: Float
    notes: String
    createdAt: String!
  }

  input CreateAnnotationInput {
    assetId: ID!
    title: String
    description: String
    tags: [String!]
    metadata: JSON
  }

  input UpdateAnnotationInput {
    title: String
    description: String
    tags: [String!]
    metadata: JSON
  }

  input AddRegionInput {
    shapeType: AnnotationShapeType!
    coordinates: JSON!
    style: JSON
  }

  input UpdateRegionInput {
    coordinates: JSON
    style: JSON
  }

  # Entity types
  type Entity {
    id: ID!
    entityType: String!
    displayName: String
    attributes: [EntityAttribute!]!
    tags: [String!]
    metadata: JSON
    createdAt: String!
    updatedAt: String!
  }

  type EntityAttribute {
    id: ID!
    entityId: ID!
    attributeName: String!
    attributeValue: JSON!
    confidence: Float
    createdAt: String!
    updatedAt: String!
  }

  input CreateEntityInput {
    entityType: String!
    displayName: String
    tags: [String!]
    metadata: JSON
  }

  input UpdateEntityInput {
    displayName: String
    tags: [String!]
    metadata: JSON
  }

  input AddEntityAttributeInput {
    attributeName: String!
    attributeValue: JSON!
    confidence: Float
  }

  input UpdateEntityAttributeInput {
    attributeName: String
    attributeValue: JSON
    confidence: Float
  }

  scalar JSON
`;
