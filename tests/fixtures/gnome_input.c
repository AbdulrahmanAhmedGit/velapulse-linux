/* Input sender for a marked PRIVATE GNOME test session. Never a host driver. */
#include <libei.h>
#include <poll.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <unistd.h>
static unsigned long long now_us(void) {struct timespec t;clock_gettime(CLOCK_MONOTONIC,&t);return (unsigned long long)t.tv_sec*1000000+t.tv_nsec/1000;}
int main(int argc,char **argv) {
 const char *isolated=getenv("VELAPULSE_ISOLATED_TEST"),*runtime=getenv("XDG_RUNTIME_DIR");char marker[4096];
 if(argc!=2||!isolated||strcmp(isolated,"1")||!runtime)return 2;
 snprintf(marker,sizeof marker,"%s/velapulse-test-session",runtime);if(access(marker,F_OK))return 2;
 struct ei *ei=ei_new_sender(NULL);ei_configure_name(ei,"VelaPulse private input test");if(ei_setup_backend_fd(ei,atoi(argv[1])))return 3;
 struct ei_device *pointer=NULL,*button=NULL,*keyboard=NULL,*scroll=NULL;int ready=0;unsigned long long deadline=now_us()+10000000;
 setvbuf(stdout,NULL,_IOLBF,0);
 while(1){
  struct pollfd fds[2]={{ei_get_fd(ei),POLLIN,0},{STDIN_FILENO,POLLIN,0}};if(poll(fds,2,50)<0)break;
  ei_dispatch(ei);struct ei_event *event;
  while((event=ei_get_event(ei))){enum ei_event_type type=ei_event_get_type(event);struct ei_device *d=ei_event_get_device(event);
   if(type==EI_EVENT_DISCONNECT)return 4;
   if(type==EI_EVENT_SEAT_ADDED)ei_seat_bind_capabilities(ei_event_get_seat(event),EI_DEVICE_CAP_POINTER,EI_DEVICE_CAP_BUTTON,EI_DEVICE_CAP_KEYBOARD,EI_DEVICE_CAP_SCROLL,NULL);
   if(type==EI_EVENT_DEVICE_RESUMED){ei_device_start_emulating(d,1);if(ei_device_has_capability(d,EI_DEVICE_CAP_POINTER))pointer=ei_device_ref(d);if(ei_device_has_capability(d,EI_DEVICE_CAP_BUTTON))button=ei_device_ref(d);if(ei_device_has_capability(d,EI_DEVICE_CAP_KEYBOARD))keyboard=ei_device_ref(d);if(ei_device_has_capability(d,EI_DEVICE_CAP_SCROLL))scroll=ei_device_ref(d);}
   if(type==EI_EVENT_DEVICE_PAUSED||type==EI_EVENT_DEVICE_REMOVED){if(d==pointer)pointer=NULL;if(d==button)button=NULL;if(d==keyboard)keyboard=NULL;if(d==scroll)scroll=NULL;}
   ei_event_unref(event);
  }
  if(!ready&&pointer&&button&&keyboard&&scroll){puts("READY");ready=1;}
  if(!ready&&now_us()>deadline)return 5;
  if(fds[1].revents&(POLLHUP|POLLERR))break;
  if(ready&&(fds[1].revents&POLLIN)){
   char line[128],operation[16];double x,y;unsigned code,state;if(!fgets(line,sizeof line,stdin))break;
   if(sscanf(line,"%15s",operation)!=1)return 6;
   struct ei_device *d=NULL;
   if(!strcmp(operation,"motion")&&sscanf(line,"%*s %lf %lf",&x,&y)==2){d=pointer;if(d)ei_device_pointer_motion(d,x,y);}
   else if(!strcmp(operation,"scroll")&&sscanf(line,"%*s %lf %lf",&x,&y)==2){d=scroll;if(d)ei_device_scroll_delta(d,x,y);}
   else if(!strcmp(operation,"button")&&sscanf(line,"%*s %u %u",&code,&state)==2){d=button;if(d)ei_device_button_button(d,code,state!=0);}
   else if(!strcmp(operation,"key")&&sscanf(line,"%*s %u %u",&code,&state)==2){d=keyboard;if(d)ei_device_keyboard_key(d,code,state!=0);}
   if(!d)return 7;
   ei_device_frame(d,now_us());puts("OK");
  }
 }
 ei_unref(ei);return 0;
}
