package com.kafka.backend.project;
import com.kafka.backend.common.*;
import com.kafka.backend.shareddesk.DeskService;
import java.util.*;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class ProjectDeletionSharedDeskTest {
 @Test void unlinkAndDeltaAreRequestedBeforeOwnedProjectDeletion(){UUID owner=UUID.randomUUID(),id=UUID.randomUUID();var repository=mock(ProjectRepository.class);var phases=mock(PhaseRepository.class);var project=mock(Project.class);var desk=mock(DeskService.class);when(project.getId()).thenReturn(id);when(repository.findByIdAndUserId(id,owner)).thenReturn(Optional.of(project));var service=new ProjectService(repository,phases,()->owner);service.sharedDesk(desk);service.delete(id);var order=inOrder(desk,repository);order.verify(desk).unlinkProject(id);order.verify(repository).delete(project);}
 @Test void blockedOrForeignProjectNeverUnlinksDeskContent(){UUID owner=UUID.randomUUID(),id=UUID.randomUUID();var repository=mock(ProjectRepository.class);var phases=mock(PhaseRepository.class);var project=mock(Project.class);var desk=mock(DeskService.class);when(project.getId()).thenReturn(id);when(repository.findByIdAndUserId(id,owner)).thenReturn(Optional.of(project));when(phases.existsByProjectId(id)).thenReturn(true);var service=new ProjectService(repository,phases,()->owner);service.sharedDesk(desk);assertThatThrownBy(()->service.delete(id)).isInstanceOf(InvalidRequestException.class);verifyNoInteractions(desk);when(repository.findByIdAndUserId(id,owner)).thenReturn(Optional.empty());assertThatThrownBy(()->service.delete(id)).isInstanceOf(ResourceNotFoundException.class);verifyNoInteractions(desk);verify(repository,never()).delete(any());}
}
