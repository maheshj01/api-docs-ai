// src/store/dataSlice.ts
import { Agent, LLM_Model } from 'src/utils/Constants';
import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { ResponseProviderFactory } from 'src/services/ResponseProviderFactory';
import { LLM_Provider } from 'src/services/ResponseProvider';

const initialState: { agent: Agent, model: LLM_Model, chatId?: string, models: LLM_Model[] } = {
    agent: 'nextjs',
    model: 'llama3.1',
    models: ['llama2', 'llama3', 'llama3.1'],
    // currently selected chatId in the sidebar
    chatId: undefined,
};

const appSlice = createSlice({
    name: 'app',
    initialState,
    reducers: {
        setAgent: (state, action) => {
            state.agent = action.payload;
        },
        setModel: (state, action) => {
            state.model = action.payload;
        },
        setModels: (state, action) => {
            state.models = action.payload
        },
        setChatId: (state, action) => {
            state.chatId = action.payload;
        },
        resetAppSlice: (state) => {
            state.agent = 'nextjs';
            state.model = 'llama3.1';
            state.chatId = undefined;
        }
    },
    extraReducers: (builder) => {
        builder.addCase(fetchModels.fulfilled, (state, action) => {
            state.models = action.payload.models;
        });
    }
});

export const fetchModels = createAsyncThunk<
    { models: string[] },
    void,
    { rejectValue: Object }
>(
    'app/fetchModels',
    async (_, { rejectWithValue }) => {
        try {
            const provider_name = LLM_Provider.local_llm;
            const provider = ResponseProviderFactory.getProvider(provider_name);
            const models = await provider.getModels();
            console.log('models', models);
            return { models };
        } catch (error) {
            return rejectWithValue({ message: 'Failed to fetch models' });
        }
    }
);


export const { setAgent, setModel, setChatId } = appSlice.actions;
export default appSlice.reducer;
