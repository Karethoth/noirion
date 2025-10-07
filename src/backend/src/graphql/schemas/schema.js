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