import { gql } from '@apollo/client';

export const DEV_RESET_DATABASE = gql`
  mutation DevResetDatabase($confirm: String!) {
    devResetDatabase(confirm: $confirm)
  }
`;
