### Goal to create a LLM powered API DOCS chatbot (Dash API)

This todo is a self-reminder for the tasks that need to be done to achieve the goal. This helps to have a clarity on what needs to be done and what is pending. You can also add your notes here.

#### Notes for Mahesh

- [x] During signup save a new user
- [x] Create New Chat and return the chat_id
- [x] New Chat creation should also send first message and also save first message in state
- [x] Route to new chat_id
- [x] Bot response should be collected and saved in state and also saved to database on Stream completion
- [x] Create New Chat is not sending first message
- [x] Show loading when bot response is being fetched
- [x] Bot message animation is not showing
- [x] Bot animation should not be shown when fetching messages
- [x] Use Local time when fetching messages
- [x] show error if backend is down or request fails
- [x] Add model select under ChatInput
- [x] Cancel ongoing request from chatInput
- [] When streaming changing chat_id is sending response in wrong chats
- [] Add index_name in New Chat Input
- [] Sidebar should show delete confirmation dialog
- [] Allow Chat Rename in Sidebar
- [] Implement Google Auth
- [] API requests are being sent twice ref: https://stackoverflow.com/a/73174743/8253662

-           ChatInput
               |
               |
      NewChat ------ ChatScreen
        |               |

#### Notes for Robin

- [] For an edit query, the frontend should delete all messages from the current edit query to the last message. After that, it should send an API call with an 'edit query' flag. This flag will be used to first fetch all updates stored in Redis from Supabase.
- [x] GRPC routes for models availabe, indexs available
- [] web search RAG for LLM in the grpc sserver
- [] LLM reasoner and AI agents
- [] Multi modal capabilities

#### Notes for Darshan
