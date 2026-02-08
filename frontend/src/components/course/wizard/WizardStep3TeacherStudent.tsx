'use client';

import { useState, useEffect } from 'react';
import { GraduationCap, BookOpen, Pencil, X } from 'lucide-react';
import { create } from '@bufbuild/protobuf';
import Button from '@/components/ui/Button';
import type { WizardContext, WizardEvent } from '@/machines/wizardMachine';
import type { SMEPersona, AudiencePersona } from '@/gen/mirai/v1/course_wizard_pb';
import { SMEPersonaSchema, AudiencePersonaSchema } from '@/gen/mirai/v1/course_wizard_pb';

interface WizardStep3TeacherStudentProps {
  context: WizardContext;
  send: (event: WizardEvent) => void;
}

type EditTarget = 'teacher' | 'student' | null;

export function WizardStep3TeacherStudent({ context, send }: WizardStep3TeacherStudentProps) {
  const [editTarget, setEditTarget] = useState<EditTarget>(null);

  // Local edit state for teacher
  const [teacherTitle, setTeacherTitle] = useState(context.teacher?.jobTitle ?? '');
  const [teacherDesc, setTeacherDesc] = useState(context.teacher?.description ?? '');
  const [teacherVoice, setTeacherVoice] = useState(context.teacher?.voice ?? '');

  // Local edit state for student
  const [studentName, setStudentName] = useState(context.student?.name ?? '');
  const [studentRole, setStudentRole] = useState(context.student?.role ?? '');
  const [studentGoals, setStudentGoals] = useState(context.student?.goals?.join(', ') ?? '');

  // Sync local state when opening modal
  useEffect(() => {
    if (editTarget === 'teacher') {
      setTeacherTitle(context.teacher?.jobTitle ?? '');
      setTeacherDesc(context.teacher?.description ?? '');
      setTeacherVoice(context.teacher?.voice ?? '');
    } else if (editTarget === 'student') {
      setStudentName(context.student?.name ?? '');
      setStudentRole(context.student?.role ?? '');
      setStudentGoals(context.student?.goals?.join(', ') ?? '');
    }
  }, [editTarget, context.teacher, context.student]);

  const saveTeacher = () => {
    const updated = create(SMEPersonaSchema, {
      id: context.teacher?.id ?? 'teacher-1',
      jobTitle: teacherTitle,
      description: teacherDesc,
      voice: teacherVoice,
      skills: context.teacher?.skills ?? [],
    });
    send({ type: 'SET_TEACHER', teacher: updated });
    setEditTarget(null);
  };

  const saveStudent = () => {
    const updated = create(AudiencePersonaSchema, {
      id: context.student?.id ?? 'student-1',
      name: studentName,
      role: studentRole,
      description: context.student?.description ?? '',
      goals: studentGoals.split(',').map((g) => g.trim()).filter(Boolean),
    });
    send({ type: 'SET_STUDENT', student: updated });
    setEditTarget(null);
  };

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="text-center mb-8">
        <h2 className="text-xl font-semibold text-primary mb-2">
          Meet Your Teacher & Student
        </h2>
        <p className="text-sm text-secondary max-w-lg mx-auto">
          AI has created expert profiles based on your topic. You can edit them to match your needs.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Teacher card (read-only) */}
        <button
          type="button"
          onClick={() => setEditTarget('teacher')}
          className="border rounded-xl p-5 bg-surface text-left hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-sm transition-all group cursor-pointer"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                <GraduationCap className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400 uppercase tracking-wide">
                Teacher
              </span>
            </div>
            <span className="p-2 text-muted group-hover:text-primary transition-colors">
              <Pencil className="w-4 h-4" />
            </span>
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold text-primary">{context.teacher?.jobTitle ?? 'Expert'}</h3>
            <p className="text-sm text-secondary line-clamp-3">{context.teacher?.description ?? 'AI-generated expert profile'}</p>
            {context.teacher?.voice && (
              <p className="text-xs text-muted italic line-clamp-1">&ldquo;{context.teacher.voice}&rdquo;</p>
            )}
          </div>
        </button>

        {/* Student card (read-only) */}
        <button
          type="button"
          onClick={() => setEditTarget('student')}
          className="border rounded-xl p-5 bg-surface text-left hover:border-amber-300 dark:hover:border-amber-700 hover:shadow-sm transition-all group cursor-pointer"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <span className="text-xs font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wide">
                Student
              </span>
            </div>
            <span className="p-2 text-muted group-hover:text-primary transition-colors">
              <Pencil className="w-4 h-4" />
            </span>
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold text-primary">{context.student?.name ?? 'Learner'}</h3>
            <p className="text-sm text-secondary">{context.student?.role ?? 'Target learner'}</p>
            {context.student?.goals && context.student.goals.length > 0 && (
              <ul className="text-xs text-muted space-y-1">
                {context.student.goals.map((goal, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="text-emerald-500 mt-0.5">&#x2022;</span>
                    {goal}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </button>
      </div>

      {/* Edit Modal */}
      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setEditTarget(null)}
          />

          {/* Modal */}
          <div className="relative w-full max-w-lg bg-surface border rounded-2xl shadow-xl">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center ${
                  editTarget === 'teacher'
                    ? 'bg-indigo-100 dark:bg-indigo-900/30'
                    : 'bg-amber-100 dark:bg-amber-900/30'
                }`}>
                  {editTarget === 'teacher' ? (
                    <GraduationCap className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  ) : (
                    <BookOpen className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  )}
                </div>
                <h3 className="text-lg font-semibold text-primary">
                  Edit {editTarget === 'teacher' ? 'Teacher' : 'Student'}
                </h3>
              </div>
              <button
                onClick={() => setEditTarget(null)}
                className="p-2 text-muted hover:text-primary rounded-lg hover:bg-hover transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal body */}
            <div className="px-6 py-5 space-y-4">
              {editTarget === 'teacher' ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-secondary mb-1.5">Title / Role</label>
                    <input
                      value={teacherTitle}
                      onChange={(e) => setTeacherTitle(e.target.value)}
                      className="w-full px-3 py-2.5 bg-page border rounded-lg text-sm text-primary focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-secondary mb-1.5">Expertise</label>
                    <textarea
                      value={teacherDesc}
                      onChange={(e) => setTeacherDesc(e.target.value)}
                      rows={4}
                      className="w-full px-3 py-2.5 bg-page border rounded-lg text-sm text-primary focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-secondary mb-1.5">Teaching Voice</label>
                    <input
                      value={teacherVoice}
                      onChange={(e) => setTeacherVoice(e.target.value)}
                      className="w-full px-3 py-2.5 bg-page border rounded-lg text-sm text-primary focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-secondary mb-1.5">Name</label>
                    <input
                      value={studentName}
                      onChange={(e) => setStudentName(e.target.value)}
                      className="w-full px-3 py-2.5 bg-page border rounded-lg text-sm text-primary focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-secondary mb-1.5">Role</label>
                    <input
                      value={studentRole}
                      onChange={(e) => setStudentRole(e.target.value)}
                      className="w-full px-3 py-2.5 bg-page border rounded-lg text-sm text-primary focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-secondary mb-1.5">Learning Goals</label>
                    <p className="text-xs text-muted mb-1.5">Separate goals with commas</p>
                    <textarea
                      value={studentGoals}
                      onChange={(e) => setStudentGoals(e.target.value)}
                      rows={4}
                      className="w-full px-3 py-2.5 bg-page border rounded-lg text-sm text-primary focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                    />
                  </div>
                </>
              )}
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditTarget(null)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={editTarget === 'teacher' ? saveTeacher : saveStudent}
              >
                Save Changes
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
