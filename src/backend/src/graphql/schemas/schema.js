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
  }
  
  type Mutation {
    createUser(username: String!, email: String!, password: String!): User
    updateUser(id: Int!, username: String, email: String): User
    deleteUser(id: Int!): Boolean
    uploadImage(file: Upload!): Image!
    uploadImages(files: [Upload!]!): [Image!]!
  }
  
  type User {
    id: Int
    username: String
    email: String
    created_at: String
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
    latitude: Float
    longitude: Float
    exifData: JSON
    captureTimestamp: String
    cameraMake: String
    cameraModel: String
    uploadedAt: String!
    uploadedBy: ID
    metadata: JSON
  }
  
  input BoundsInput {
    northEast: CoordinateInput!
    southWest: CoordinateInput!
  }
  
  input CoordinateInput {
    lat: Float!
    lng: Float!
  }
  
  scalar JSON
`;