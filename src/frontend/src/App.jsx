import { useState } from 'react'
import { ApolloClient, HttpLink, InMemoryCache, gql } from '@apollo/client'
import { ApolloProvider, useQuery } from '@apollo/client/react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
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
  const [count, setCount] = useState(0)

  return (
    <ApolloProvider client={client}>
      <div>
        <a href="https://vite.dev" target="_blank">
          <img src={viteLogo} className="logo" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>

      <h1>Vite & React & Apollo</h1>

      <div className="card">
        <button onClick={() => setCount((count) => count + 1)}>
          count is {count}
        </button>
        <p>
          Edit <code>src/App.jsx</code> and save to test HMR
        </p>
      </div>

      <Hello />

      <p className="read-the-docs">
        Click on the Vite and React logos to learn more
      </p>
    </ApolloProvider>
  )
}

export default App
