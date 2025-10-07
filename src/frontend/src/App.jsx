import { ApolloClient, HttpLink, InMemoryCache, gql } from '@apollo/client'
import { ApolloProvider, useQuery } from '@apollo/client/react'
import ImageMap from './components/ImageMap'
import ImageUpload from './components/ImageUpload'
import './App.css'

const client = new ApolloClient({
  cache: new InMemoryCache(),
  link: new HttpLink({
    uri: 'http://localhost:4000/graphql',
    fetch: fetch,
  }),
})

const HELLO_QUERY = gql`
  query {
    hello
  }
`

function Hello() {
  const { loading, error, data } = useQuery(HELLO_QUERY)

  if (loading) return <p>Loading...</p>
  if (error) return <p>Error: {error.message}</p>

  return <p>{data.hello}</p>
}

function App() {
  return (
    <ApolloProvider client={client}>
      <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
        <h1>🔍 Noirion - Image Investigation Platform</h1>
        <p>Upload images with GPS data and visualize them on an OpenStreetMap</p>
        
        <Hello />
        
        <h2>📤 Upload Images</h2>
        <ImageUpload />
        
        <h2>🗺️ Image Map</h2>
        <ImageMap />
      </div>
    </ApolloProvider>
  )
}

export default App
