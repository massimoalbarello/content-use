/* initdb uses popen(), whose glibc implementation hardcodes /bin/sh. nibrun
 * has no system shell. This initdb-only adapter executes our pinned BusyBox.
 * initdb opens at most one subprocess stream at a time. Never preload this
 * library into the application or the PostgreSQL server. */
typedef struct _IO_FILE FILE;
extern int pipe(int *), fork(void), dup2(int,int), close(int), execv(const char *,char *const *);
extern void _exit(int);
extern FILE *fdopen(int,const char *);
extern int fclose(FILE *), waitpid(int,int *,int);
extern char *getenv(const char *);
extern int *__errno_location(void);
static int child_pid=-1;
static FILE *child_stream;
FILE *popen(const char *command,const char *mode) {
  if(child_pid!=-1 || !command || !mode || (mode[0]!='r' && mode[0]!='w')) return (FILE *)0;
  const char *shell=getenv("CONTENT_USE_INITDB_SHELL");
  if(!shell) return (FILE *)0;
  int fds[2]; if(pipe(fds)) return (FILE *)0;
  int reading=mode[0]=='r';
  int pid=fork();
  if(pid<0){close(fds[0]);close(fds[1]);return (FILE *)0;}
  if(!pid){
    close(fds[reading?0:1]);
    if(dup2(fds[reading?1:0],reading?1:0)<0) _exit(127);
    close(fds[reading?1:0]);
    char *args[]={(char *)shell,"sh","-c",(char *)command,(char *)0};
    execv(shell,args); _exit(127);
  }
  close(fds[reading?1:0]);
  FILE *stream=fdopen(fds[reading?0:1],mode);
  if(!stream){close(fds[reading?0:1]);waitpid(pid,(int *)0,0);return stream;}
  child_pid=pid;child_stream=stream;return stream;
}
int pclose(FILE *stream){
  if(stream!=child_stream || child_pid<0) return -1;
  int pid=child_pid,status=0;child_pid=-1;child_stream=(FILE *)0;
  fclose(stream);
  int result; do{result=waitpid(pid,&status,0);}while(result<0 && *__errno_location()==4);
  return result<0?-1:status;
}
