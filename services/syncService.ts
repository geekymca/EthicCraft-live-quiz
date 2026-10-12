
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) || 'https://kjgmbyffulbazesugfsd.supabase.co';
const SUPABASE_ANON_KEY = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY) || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtqZ21ieWZmdWxiYXplc3VnZnNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxMzI1MzEsImV4cCI6MjA4NTcwODUzMX0.-RIy4wVYfB9QXUWVFftCh5mOOs6RSFbooDnTcyWOVmY';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Quiz Operations
export const saveQuizToFirebase = async (quiz: any) => {
  const { error } = await supabase
    .from('quizzes')
    .upsert({
      id: quiz.id,
      title: quiz.title,
      description: quiz.description,
      questions: quiz.questions,
      is_special: quiz.isSpecial,
      created_at: new Date(quiz.createdAt).toISOString()
    });
  if (error) throw error;
};

export const deleteQuizFromFirebase = async (quizId: string) => {
  const { error } = await supabase.from('quizzes').delete().eq('id', quizId);
  if (error) throw error;
};

export const fetchQuizzesFromFirebase = async () => {
  const { data, error } = await supabase.from('quizzes').select('*').order('created_at', { ascending: false });
  if (error) return [];
  return data.map(q => ({
    ...q,
    isSpecial: q.is_special,
    createdAt: new Date(q.created_at).getTime()
  }));
};

// Room Operations
export const createRoom = async (session: any) => {
  const { error } = await supabase.from('rooms').insert({
    room_code: session.roomCode,
    quiz_id: session.quizId,
    status: session.status,
    current_question_index: session.currentQuestionIndex,
    start_time: session.startTime,
    created_at: new Date().toISOString()
  });
  if (error) throw error;
};

export const deleteRoom = async (roomCode: string) => {
  await supabase.from('participants').delete().eq('room_code', roomCode);
  const { error } = await supabase.from('rooms').delete().eq('room_code', roomCode);
  if (error) throw error;
};

// Polling Method for Participants (Low Resource Usage)
export const getRoomState = async (roomCode: string) => {
  const { data, error } = await supabase
    .from('rooms')
    .select('*')
    .eq('room_code', roomCode)
    .maybeSingle();
  
  if (error || !data) return null;
  return {
    ...data,
    roomCode: data.room_code,
    quizId: data.quiz_id,
    currentQuestionIndex: data.current_question_index,
    startTime: data.start_time
  };
};

export const getParticipantsOnce = async (roomCode: string) => {
  const { data, error } = await supabase
    .from('participants')
    .select('*')
    .eq('room_code', roomCode);
  if (error) return [];
  return data;
};

export const syncAllRooms = (callback: (rooms: any[]) => void) => {
  supabase.from('rooms').select('*').then(({ data }) => {
    if (data) callback(data.map(r => ({ ...r, roomCode: r.room_code, quizId: r.quiz_id })));
  });

  const subscription = supabase
    .channel('all-rooms')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, async () => {
      const { data } = await supabase.from('rooms').select('*');
      if (data) callback(data.map(r => ({ ...r, roomCode: r.room_code, quizId: r.quiz_id })));
    })
    .subscribe();

  return () => { supabase.removeChannel(subscription); };
};

export const syncSession = (roomCode: string, callback: (data: any) => void) => {
  supabase.from('rooms').select('*').eq('room_code', roomCode).single().then(({ data }) => {
    if (data) callback({
      ...data,
      roomCode: data.room_code,
      quizId: data.quiz_id,
      currentQuestionIndex: data.current_question_index,
      startTime: data.start_time
    });
  });

  const subscription = supabase
    .channel(`room-${roomCode}`)
    .on('postgres_changes', { 
      event: 'UPDATE', 
      schema: 'public', 
      table: 'rooms',
      filter: `room_code=eq.${roomCode}`
    }, (payload) => {
      const data = payload.new;
      callback({
        ...data,
        roomCode: data.room_code,
        quizId: data.quiz_id,
        currentQuestionIndex: data.current_question_index,
        startTime: data.start_time
      });
    })
    .subscribe();

  return () => { supabase.removeChannel(subscription); };
};

export const syncParticipants = (roomCode: string, callback: (participants: any[]) => void) => {
  supabase.from('participants').select('*').eq('room_code', roomCode).then(({ data }) => {
    if (data) callback(data);
  });

  const subscription = supabase
    .channel(`participants-${roomCode}`)
    .on('postgres_changes', { 
      event: '*', 
      schema: 'public', 
      table: 'participants',
      filter: `room_code=eq.${roomCode}`
    }, async () => {
      const { data } = await supabase.from('participants').select('*').eq('room_code', roomCode);
      if (data) callback(data);
    })
    .subscribe();

  return () => { supabase.removeChannel(subscription); };
};

export const updateRoomState = async (roomCode: string, updates: any) => {
  const dbUpdates: any = {};
  if (updates.status) dbUpdates.status = updates.status;
  if (updates.currentQuestionIndex !== undefined) dbUpdates.current_question_index = updates.currentQuestionIndex;
  if (updates.startTime !== undefined) dbUpdates.start_time = updates.startTime;

  const { error } = await supabase
    .from('rooms')
    .update(dbUpdates)
    .eq('room_code', roomCode);
  if (error) throw error;
};

export const addParticipantToRoom = async (roomCode: string, participant: any) => {
  const { error } = await supabase.from('participants').insert({
    id: participant.id,
    room_code: roomCode,
    name: participant.name,
    roll_number: participant.rollNumber,
    score: participant.score,
    total_time_taken: participant.totalTimeTaken,
    last_time_taken: participant.lastTimeTaken,
    last_answered_correctly: participant.lastAnsweredCorrectly,
    answered_question_index: participant.answeredQuestionIndex
  });
  if (error) throw error;
};

export const updateParticipantInRoom = async (roomCode: string, participantId: string, updates: any) => {
  const dbUpdates: any = {};
  if (updates.score !== undefined) dbUpdates.score = updates.score;
  if (updates.totalTimeTaken !== undefined) dbUpdates.total_time_taken = updates.totalTimeTaken;
  if (updates.lastTimeTaken !== undefined) dbUpdates.last_time_taken = updates.lastTimeTaken;
  if (updates.lastAnsweredCorrectly !== undefined) dbUpdates.last_answered_correctly = updates.lastAnsweredCorrectly;
  if (updates.answeredQuestionIndex !== undefined) dbUpdates.answered_question_index = updates.answeredQuestionIndex;

  const { error } = await supabase
    .from('participants')
    .update(dbUpdates)
    .eq('id', participantId)
    .eq('room_code', roomCode);
  if (error) throw error;
};

export const checkRoomExists = async (roomCode: string) => {
  const { data } = await supabase
    .from('rooms')
    .select('room_code')
    .eq('room_code', roomCode)
    .maybeSingle();
  return !!data;
};
