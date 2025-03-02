import React from 'react';
import MDPreview from './MDPreview';
import IconButton from './IconButton';
import { MdOutlineEdit } from "react-icons/md";
import ChatInput from './ChatInput';
import { Button } from '@nextui-org/react';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from '../redux/store';
import DateTimeHelper from '../utils/DateTimeHelper';
import { addUserMessage, deleteMessagesOnEdit, sendMessage, streamResponse } from '../redux/reducers/chatSlice';
import { LLM_Provider } from '../services/ResponseProvider';

interface ChatProps {
    chat: any
    index: number
    length: number
}

const ChatBubble: React.FC<ChatProps> = ({ chat, index, length }) => {
    const { message, timestamp } = chat;
    const [isEditing, setIsEditing] = React.useState<boolean>(false);
    const [hovered, setHovered] = React.useState<boolean>(false);
    const dispatch = useDispatch<AppDispatch>();
    const localTime = DateTimeHelper.formatLocalTime(timestamp);
    const agent = useSelector((state: RootState) => state.app.agent);

    const UpdatePrompt = async (query: string, chatId: string) => {
        if (chatId != null) {
            dispatch(deleteMessagesOnEdit({
                chat_id: chatId,
                chat: chat,
                message_id: chat.id,
                index: index
            }));

            await dispatch(addUserMessage({
                chatId: chatId,
                message: query,
                sender: "user"
            }));
            await Promise.all([
                dispatch(sendMessage({
                    chat_id: chatId,
                    message: query,
                    sender: "user"
                })).unwrap(),
                dispatch(streamResponse({
                    provider_name: LLM_Provider.local_llm,
                    message: query,
                    agent: agent
                })).unwrap()
            ]);
        }
    }

    return (
        <div
            onMouseEnter={
                () => setHovered(true)}
            onMouseLeave={
                () => setHovered(false)}
            className={`my-2 pt-2}`}>
            {isEditing ? (
                <ChatInput
                    value={message}
                    overrideSend={true}
                    onSend={(query, chatId) => {
                        setIsEditing(false)
                        UpdatePrompt(query, chatId)
                    }} />
            ) : (<div className='relative'>
                <MDPreview
                    style={{
                        borderRadius: '0.8rem',
                        // boxShadow: '0 0 0 1px var(--chat-bubble-border)',
                        backgroundColor: 'var(--chat-bubble-surface)'
                    }}
                    className={`inline-block px-4 py-2 rounded-lgtext-white`}
                    value={message} />
                {hovered && (
                    <IconButton
                        className='absolute -left-10 -top-4'
                        ariaLabel="Edit"
                        onClick={() =>
                            setIsEditing(!isEditing)
                        }>
                        <MdOutlineEdit className=" bg-slate-200 rounded-full w-8 h-8 p-2 size-10 text-black" />
                    </IconButton>
                )}
            </div>)
            }
            <div className='flex justify-between px-2 pt-1'>
                {/* {loading && index === length - 1 ? <Spinner /> : <div />} */}
                <div className="text-xs text-gray-500 ">{localTime}</div>
                {isEditing && <Button
                    className='text-xs text-gray-600'
                    onPress={() => setIsEditing(false)}>
                    Cancel
                </Button>

                }
            </div>
        </div >
    );
};

export default ChatBubble;
